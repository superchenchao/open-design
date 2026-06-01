# AMR Windows Vela Config Permission Conclusion

Date: 2026-06-01

## Finding

On Windows, `vela.exe` rejects `C:\Users\<user>\.amr\config.json` before `vela login` or `vela models` can proceed when it applies the POSIX `0600 or stricter` permission check.

Tightening the Windows ACL to only the current user does not satisfy the check because POSIX-style stat still reports modes such as `0666` or `0444` on Windows. This blocks:

- the AMR `Authorize` button, because `/api/integrations/vela/login` spawns `vela login`
- the AMR model picker, because daemon discovery runs `vela models`

## Preferred Root Fix

Fix this in `vela-cli`, not Open Design:

- keep the strict `0600` check on macOS/Linux
- skip the POSIX permission check on Windows, or replace it with a Windows ACL-aware check later

Recommended minimal Vela fix:

```go
if runtime.GOOS == "windows" {
    return nil
}
```

inside the config permission validation function.

After publishing the fixed Vela package, bump `@powerformer/vela-cli` in Open Design and rebuild the Windows installer.
