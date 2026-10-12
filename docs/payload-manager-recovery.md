# Starting and recovering Payload Manager

AI-assisted local setup notes for firmware 12.02.

On the local firmware-12.02 console, the User Guide log reported that the
kernel payload completed and that the loopback ELF loader accepted connections
on `127.0.0.1:9021`, while FTP and Payload Manager did not respond over the LAN.
The user observed this after waking the console from rest mode. The underlying
rest-mode failure has not yet been established.

The normal `elfldr-check.js` deliberately stops the entire queue when an ELF
loader already accepts connections. This avoids running the kernel exploit
again, but also skips the installer/autoload step. “Already loaded” therefore
does not confirm that etaHEN, Payload Manager, or ShadowMountPlus is running.

`payloads/recover-manager.js` provides a separate recovery path. It first checks
the console's loopback Payload Manager listener on port 8084 and sends nothing
if that listener is present. Otherwise, it requires an existing loopback ELF
loader and sends the embedded official `pldmgr.elf`. It does not run a kernel
exploit or the WebKit Autoloader installer. Socket writes have a five-second
timeout, and sockets and mapped memory are released on errors.

Payload Manager can then run its saved autoload configuration. This console's
configuration selects `etaHEN-11.00-13.60.elf`; etaHEN subsequently starts the
marker-enabled ShadowMountPlus, PS5SXHelper, and nanoDNS payloads. Verify fresh
startup logs before treating any service as recovered. Do not substitute the
original `etaHEN_2.5B.bin` for the experimental firmware-12.02 build.

## Building a recovery page

Obtain the official Payload Manager ELF and verify its release checksum. The
locally prepared page uses `pldmgr_v0.5.2.elf`, SHA-256
`62b3ba2a4937c2afc502f9a4e7242cca538610ebb4ae2800c7c6f72e7f268e7c`.

Pass absolute paths for payloads outside the remote-loader submodule:

```powershell
python third_party/ps5-webkit-remote-loader/tools/build_standalone.py `
  "$PWD/payloads/recover-manager.js" --no-kexp `
  --embed "pldmgr.elf=C:/path/to/verified/pldmgr.elf" `
  --js "$PWD/frontend/autoloader/diagnostics.js" `
  --title "PS5 WebKit Loader: Payload Manager Recovery" `
  -o "C:/path/to/recovery.html" --probe
```

Serve this page through the existing User Guide DNS/HTTPS host. Keep the PS5 DNS
at the PC host address, close User Guide completely, and reopen it. Confirm the
recovery page title before starting its WebKit step. This page requires the
existing ELF loader; it cannot perform a jailbreak after a full restart.
Restore the normal installer route when a new kernel jailbreak is needed.

The October 11 preparation and temporary host wrapper are saved outside Git
in `../PS5SX2-deploy/rest-mode-recovery/`. The user subsequently confirmed a
full restart before opening the recovery page. Its missing-loader error was
therefore expected: this route had no kernel exploit and sent no manager.

For that fresh boot, a separate `startup.html` was prepared with the normal
`elfldr-check.js`, `relapse.js`, and `autoload.js` queue. It hands the embedded
official manager ELF directly to the new loader after successful kernel setup,
instead of sending the installer ELF. The temporary host now serves this full
startup page at the User Guide root, the recovery-only page at `/recovery.html`,
and the original installer at `/install.html`, using the original certificate.
The user later confirmed the console was working again. FTP responded, and
fresh etaHEN, ShadowMountPlus, helper, and nanoDNS logs were captured. The browser
log recorded kernel completion and manager staging, but not the final transfer
message; that log alone does not establish every step of the startup handoff.

## Recreating the full startup host

Use the verified manager ELF above and the pinned loopback ELF loader obtained
by this repository's normal dependency download. Generate the full startup
page with three payloads; `autoload.js` requires successful kernel setup before
sending the manager:

```powershell
python third_party/ps5-webkit-remote-loader/tools/build_standalone.py `
  "$PWD/payloads/elfldr-check.js" payloads/relapse.js `
  "$PWD/payloads/autoload.js::pldmgr.elf" `
  --elfldr "shared/elfldr-ps5-v0.26-bb1e117.elf=C:/path/to/verified/elfldr.elf" `
  --embed "pldmgr.elf=C:/path/to/verified/pldmgr.elf" `
  --js "$PWD/frontend/autoloader/diagnostics.js" `
  --title "PS5 WebKit Loader: Full Startup and Payload Manager" `
  -o "C:/path/to/startup.html" --probe
```

The following wrapper preserves the existing bundled host's certificate,
diagnostics, and firmware routing. Stop the previous host before launching it
on the same ports. `--base-host` must point to a trusted generated Python host,
not an executable or a third-party script:

```powershell
python tools/host_payload_pages.py `
  --base-host "C:/path/to/webkit-autoloader-host.py" `
  --startup-page "C:/path/to/startup.html" `
  --recovery-page "C:/path/to/recovery.html" -- `
  --ip 10.0.0.175 --dns-bind 10.0.0.175 --share-dns-port `
  --http-port 80 --verbose --log-file "C:/path/to/host.log"
```

For a full restart, open the full startup page through User Guide, keeping DNS
at the PC host address until setup finishes. For an existing ELF loader with a
missing manager, use the separate recovery page. The full startup guard still
stops rather than running another kernel exploit when a loader is present.
Once nanoDNS is confirmed running, this console can return to DNS `127.0.0.1`.

## Checks

```powershell
node tools/test_recover_manager.js
node tools/test_browser_diagnostics.js
```

The recovery tests cover an existing manager, absent loader, complete transfers
with short writes, timeout setup failures, invalid ELF data, and resource
cleanup. The standalone builder's page and boot probes validate the generated
page; they do not replace testing on the console.
