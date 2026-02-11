; Verify decimal mode behavior
; Written by Bruce Clark.  This code is public domain.
; see http://www.6502.org/tutorials/decimal_mode.html
;
; Converted to ca65 syntax for assembly with cc65 toolchain.
;
; Returns:
;   ERROR = 0 if the test passed
;   ERROR = 1 if the test failed
;
; Configuration:
cputype = 0         ; 0 = 6502, 1 = 65C02, 2 = 65C816
vld_bcd = 0         ; 0 = allow invalid bcd, 1 = valid bcd only
chk_a   = 1         ; check accumulator
chk_n   = 0         ; check sign (negative) flag
chk_v   = 0         ; check overflow flag
chk_z   = 0         ; check zero flag
chk_c   = 1         ; check carry flag

; Zero page variables
N1    = $00
N2    = $01
HA    = $02
HNVZC = $03
DA    = $04
DNVZC = $05
AR    = $06
NF    = $07
VF    = $08
ZF    = $09
CF    = $0A
ERROR = $0B
N1L   = $0C
N1H   = $0D
N2L   = $0E
N2H   = $0F         ; 2 bytes: $0F and $10

.segment "CODE"

TEST:   ldy #1          ; initialize Y (used to loop through carry flag values)
        sty ERROR       ; store 1 in ERROR until the test passes
        lda #0          ; initialize N1 and N2
        sta N1
        sta N2
LOOP1:  lda N2          ; N2L = N2 & $0F
        and #$0F
.if vld_bcd = 1
        cmp #$0A
        bcs NEXT2
.endif
        sta N2L
        lda N2          ; N2H = N2 & $F0
        and #$F0
.if vld_bcd = 1
        cmp #$A0
        bcs NEXT2
.endif
        sta N2H
        ora #$0F        ; N2H+1 = (N2 & $F0) + $0F
        sta N2H+1
LOOP2:  lda N1          ; N1L = N1 & $0F
        and #$0F
.if vld_bcd = 1
        cmp #$0A
        bcs NEXT1
.endif
        sta N1L
        lda N1          ; N1H = N1 & $F0
        and #$F0
.if vld_bcd = 1
        cmp #$A0
        bcs NEXT1
.endif
        sta N1H
        jsr ADD
        jsr A6502
        jsr COMPARE
        bne DONE
        jsr SUB
        jsr S6502
        jsr COMPARE
        bne DONE
NEXT1:  inc N1          ; loop through all 256 values of N1
        bne LOOP2
NEXT2:  inc N2          ; loop through all 256 values of N2
        bne LOOP1
        dey
        bpl LOOP1       ; loop through both values of the carry flag
        lda #0          ; test passed, so store 0 in ERROR
        sta ERROR
DONE:   jmp DONE        ; halt - test complete (trap loop)

; Calculate the actual decimal mode accumulator and flags, the accumulator
; and flag results when N1 is added to N2 using binary arithmetic, the
; predicted accumulator result, the predicted carry flag, and the predicted
; V flag
ADD:    sed             ; decimal mode
        cpy #1          ; set carry if Y = 1, clear carry if Y = 0
        lda N1
        adc N2
        sta DA          ; actual accumulator result in decimal mode
        php
        pla
        sta DNVZC       ; actual flags result in decimal mode
        cld             ; binary mode
        cpy #1          ; set carry if Y = 1, clear carry if Y = 0
        lda N1
        adc N2
        sta HA          ; accumulator result of N1+N2 using binary arithmetic
        php
        pla
        sta HNVZC       ; flags result of N1+N2 using binary arithmetic
        cpy #1
        lda N1L
        adc N2L
        cmp #$0A
        ldx #0
        bcc A1
        inx
        adc #5          ; add 6 (carry is set)
        and #$0F
        sec
A1:     ora N1H
;
; if N1L + N2L <  $0A, then add N2 & $F0
; if N1L + N2L >= $0A, then add (N2 & $F0) + $0F + 1 (carry is set)
;
        adc N2H,x
        php
        bcs A2
        cmp #$A0
        bcc A3
A2:     adc #$5F        ; add $60 (carry is set)
        sec
A3:     sta AR          ; predicted accumulator result
        php
        pla
        sta CF          ; predicted carry result
        pla
;
; note that all 8 bits of the P register are stored in VF
;
        sta VF          ; predicted V flags
        rts

; Calculate the actual decimal mode accumulator and flags, and the
; accumulator and flag results when N2 is subtracted from N1 using binary
; arithmetic
SUB:    sed             ; decimal mode
        cpy #1          ; set carry if Y = 1, clear carry if Y = 0
        lda N1
        sbc N2
        sta DA          ; actual accumulator result in decimal mode
        php
        pla
        sta DNVZC       ; actual flags result in decimal mode
        cld             ; binary mode
        cpy #1          ; set carry if Y = 1, clear carry if Y = 0
        lda N1
        sbc N2
        sta HA          ; accumulator result of N1-N2 using binary arithmetic
        php
        pla
        sta HNVZC       ; flags result of N1-N2 using binary arithmetic
        rts

.if cputype <> 1
; Calculate the predicted SBC accumulator result for the 6502 and 65816
SUB1:   cpy #1          ; set carry if Y = 1, clear carry if Y = 0
        lda N1L
        sbc N2L
        ldx #0
        bcs S11
        inx
        sbc #5          ; subtract 6 (carry is clear)
        and #$0F
        clc
S11:    ora N1H
;
; if N1L - N2L >= 0, then subtract N2 & $F0
; if N1L - N2L <  0, then subtract (N2 & $F0) + $0F + 1 (carry is clear)
;
        sbc N2H,x
        bcs S12
        sbc #$5F        ; subtract $60 (carry is clear)
S12:    sta AR
        rts
.endif

.if cputype = 1
; Calculate the predicted SBC accumulator result for the 65C02
SUB2:   cpy #1          ; set carry if Y = 1, clear carry if Y = 0
        lda N1L
        sbc N2L
        ldx #0
        bcs S21
        inx
        and #$0F
        clc
S21:    ora N1H
;
; if N1L - N2L >= 0, then subtract N2 & $F0
; if N1L - N2L <  0, then subtract (N2 & $F0) + $0F + 1 (carry is clear)
;
        sbc N2H,x
        bcs S22
        sbc #$5F        ; subtract $60 (carry is clear)
S22:    cpx #0
        beq S23
        sbc #6
S23:    sta AR          ; predicted accumulator result
        rts
.endif

; Compare accumulator actual results to predicted results
;
; Return:
;   Z flag = 1 (BEQ branch) if same
;   Z flag = 0 (BNE branch) if different
COMPARE:
.if chk_a = 1
        lda DA
        cmp AR
        bne C1
.endif
.if chk_n = 1
        lda DNVZC
        eor NF
        and #$80        ; mask off N flag
        bne C1
.endif
.if chk_v = 1
        lda DNVZC
        eor VF
        and #$40        ; mask off V flag
        bne C1
.endif
.if chk_z = 1
        lda DNVZC
        eor ZF
        and #2
        bne C1
.endif
.if chk_c = 1
        lda DNVZC
        eor CF
        and #1          ; mask off C flag
.endif
C1:     rts

; ADC/SBC prediction routines for 6502
.if cputype = 0
A6502:  lda VF
;
; since all 8 bits of the P register were stored in VF, bit 7 of VF contains
; the N flag for NF
;
        sta NF
        lda HNVZC
        sta ZF
        rts

S6502:  jsr SUB1
        lda HNVZC
        sta NF
        sta VF
        sta ZF
        sta CF
        rts
.endif

.if cputype = 1
A6502:  lda AR
        php
        pla
        sta NF
        sta ZF
        rts

S6502:  jsr SUB2
        lda AR
        php
        pla
        sta NF
        sta ZF
        lda HNVZC
        sta VF
        sta CF
        rts
.endif

.if cputype = 2
A6502:  lda AR
        php
        pla
        sta NF
        sta ZF
        rts

S6502:  jsr SUB1
        lda AR
        php
        pla
        sta NF
        sta ZF
        lda HNVZC
        sta VF
        sta CF
        rts
.endif
