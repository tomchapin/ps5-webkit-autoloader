# PS5SX2 after the WebKit jailbreak (AI-assisted)

Successfully running the WebKit exploit does not guarantee that a subsequently
launched app has the privileges its JIT needs. The PS5SX2 installation verified
on October 11, 2026 had three distinct checks:

1. The usual jailbreak, etaHEN experimental and ShadowMountPlus were running.
2. ShadowMountPlus registered PS5SX2 2.02 (`PPSA99203`) on the home screen.
3. A PS5SX2 helper elevated the app before its interface started.

The console's native app log reported firmware **12.02**. The published 2.02 app
worked with the separate `PS5SXHelper.elf` from release 2.00 after the 2.02 AIO's
elevation daemon failed. This is a tested workaround for that failure, not a
general instruction to downgrade every console's helper.

The complete installation instructions, exact release hashes and log excerpts
are maintained in the [PS5SX2 console setup guide](https://github.com/tomchapin/PS5SX2/blob/main/ps5/docs/console-setup.md).
For sibling local checkouts, the same guide is at
`../PS5SX2/ps5/docs/console-setup.md`. The GitHub link reflects it after the
documentation changes are published.

## Load and verify

- Keep the usual jailbreak's kstuff and ShadowMountPlus available.
- Place the app at `/data/homebrew/PPSA99203/` and resources at `/data/PCSX2/`.
  Wait for ShadowMountPlus's successful registration notification/log entry.
- For the verified workaround, load `PS5SXHelper.elf` once after the jailbreak
  and before opening PS5SX2. Reload it after a console restart. It is saved at
  `/data/pldmgr/payloads/PS5SX2/PS5SXHelper.elf` in the tested installation.
  No automatic-loading config was changed or tested.
- Use Payload Manager for an ELF loader limited to localhost. Sending from a
  PC to port 9021 worked with the LAN-accessible loader in this session; it is
  not guaranteed by the WebKit Autoloader's default localhost-only loader.
- Put the main PS2 BIOS in `/data/PCSX2/bios/` and game images in
  `/data/PCSX2/games/`, using lowercase folder names. The BIOS example filename
  shown by the app is not mandatory. Neither folder is populated by this host.
- Check the interface first. Missing-BIOS and no-games messages are expected
  with empty folders. The user confirmed the interface, then a successful BIOS
  launch after a local BIOS file was transferred.

A free, self-contained homebrew test, [glampert's Dungeon Game](https://github.com/glampert/ps2-homebrew/tree/main/source/demos/dungeon_game),
was copied to `/data/PCSX2/games/dungeon_game.elf` and detected by PS5SX2's
companion game list. The transfer matched by SHA-256, and a short launch test
logged about 60 fps at 100% emulation speed. Extended gameplay was not checked.
Launch this PS2 ELF from PS5SX2's shelf, not the PS5 payload loader.

## Distinguish browser delivery from app startup

Use the PC host's `--verbose` and `--log-file` output for User's Guide DNS,
TLS/HTTP routing and the Payloads link. The setup DNS answers for
`manuals.playstation.net` and returns NXDOMAIN for other domains, so it is not
a general internet DNS resolver. Online download failures need a separate DNS
and connectivity check; manual FTP transfer can install release files without
depending on the console's download path.

Once PS5SX2 starts, inspect `/data/PCSX2/logs/boot.log` (or
`/data/PCSX2/boot.log` when `logs/` does not exist) and
`/data/PS5SXHelper.log`. Check the PID and build to distinguish attempts.

- `etaHEN request: not taken` and `no acknowledgement` identified the missing
  app-elevation service, before the interface started.
- In the official AIO's `lapy-daemon.log`, `daemon_held` with
  `stage=donor_release error=92`, `attached=1` and `target_stopped=1` identified
  the stopped app. A normal restart cleared it before the separate helper test.
- The separate helper logged `fully jailbroken`; the app logged `JIT probe ok`
  and its first interface frame after 768 ms. These checks explained the fix.

Keep the failing AIO and the separate helper out of the same launch sequence.
The owned AIO payload-menu copy was renamed `ps5sx2-aio.elf.disabled` in this
installation. Its automatic installer and remote logger were disabled before
testing; the exact switch paths and confirmation log are in the PS5SX2 guide.

The complete OnionHEN fork is a separate project from this legacy PS5SX2 helper.
Cloning it does not install or replace a HEN on the console.
