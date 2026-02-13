# Claude Code — Project Notes

## Plans

Project plans and design documents are stored in the `plans/` directory.

- [Microcomputer Emulator Selection](plans/microcomputer-emulator-selection.md) — Selected machines (Apple I, TRS-80 Model I), memory maps, test resources, and reference emulators

## UI Components

This project uses [shadcn/ui](https://ui.shadcn.com/) for UI components. When building new UI, prefer shadcn/ui components over hand-rolled HTML/CSS.

- **Add components**: `npx shadcn@latest add <component>` (e.g., `npx shadcn@latest add button`)
- **Config**: `components.json` in project root
- **Component location**: `src/components/ui/`
- **Utility function**: `cn()` from `@/lib/utils` for merging Tailwind classes
- **Installed components**: tabs, badge

The app is dark-mode only (terminal emulator). The `dark` class is set on `<html>` and CSS variables use the dark theme on `:root` directly. Custom terminal colors (`--color-terminal-green`, `--color-terminal-bg`, `--color-terminal-border`) are defined in `globals.css`.

## Testing

**IMPORTANT: Always run tests before committing changes.**

Before committing any code changes, you MUST verify that all tests pass:

```bash
npx vitest run
```

All tests must pass (exit code 0) before creating a commit. This ensures:
- No regressions in CPU emulation or UI components
- Type safety is maintained
- Integration tests validate end-to-end functionality

If tests fail, fix the issues before committing. Do not skip or disable tests without a clear reason and TODO comment explaining why.

## GitHub CLI

Due to sandbox proxy configuration, you need to use the `-R owner/repo` flag when using `gh` commands.
