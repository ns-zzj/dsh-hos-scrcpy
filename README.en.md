# dsh-hos-scrcpy

**The HarmonyOS provider for DSH** — connects DSH to HarmonyOS devices over `hdc`: see the screen, tap/scroll, press keys, type text, and let the AI do the same.

All UI, AI tools, device/focus state, routing and permission gates **live in core**; this package only knows **how to talk to this device, how to tap it, and how to produce frames**.

> **[中文](./README.md)** | English

## What it is

| | |
|---|---|
| Role | a **provider** of dsh-scrcpy (HarmonyOS platform) |
| Dependency | needs **`dsh-scrcpy-core`** (without it this package stays inactive). It does **not** declare a package dependency on core — the two are installed freely and never pull each other |
| Transport | `hdc`: USB debugging, or `hdc tconn` for wireless |
| Sidecar | one **Java process per device** (compiled from `Dev/src/Main.java`, shipped with the package), spawned by this provider: `java -cp <jar>;<out> Main --sn … --hdc … --port 0 --scale … --frame-rate … --bit-rate … --ifr … --idle-exit …` |
| Protocol | the client half connects **directly to the sidecar's WebSocket**: binary H.264 (Annex-B) plus JSON control messages (`size` / `log` / `hid`); touch and keys share that connection |
| Not on the stream path | this provider only starts/stops the sidecar and reports devices/config — video frames and touch do **not** pass through it (this is the big difference from the Android provider) |
| Not included | client half, AI tools, AI prompts, UI registration, focus logic (all in core) |

## Highlights

| Feature | Detail |
|---|---|
| **Multiple devices across platforms** | Several devices mirror at once, each with its own session and tab; **Android and HarmonyOS can run side by side**. Operations only apply to the focused (visible) device |
| **Works on retail Huawei devices** | Uses the system mirroring service path: **no root, no system partition changes, no allow-list** |
| **Rotation** | The picture follows rotation with **no reconnect and no black screen** (rebuild is driven only by the SPS in the stream) |
| **Tab switch / pause** | Leaving a tab pauses instead of disconnecting; coming back **paints immediately** (the sidecar buffers "config + the latest keyframe up to now" and replays it); rotating while paused still survives |
| **Quality** | Wired and wireless configure scale and frame rate **separately**; both reach native resolution, capped at 120 fps |
| **AI operations and permissions** | UI and all AI tools live in core (screenshot **handed directly to the AI** / control list / tap / long-press / keys / text input); **four permissions, each in three states**, the last three depending on screenshots — when off, tools return the reason instead of retrying |
| **Free install/uninstall** | No UI, no AI, no prompts here; install core plus the provider for your platform, both platforms independently |

## Install

In the DSH **plugin panel**, install two packages:

| Order | What | Address |
|---|---|---|
| 1 | **core** — UI and AI tools live there | `@nszzj/dsh-scrcpy-core` |
| 2 | **this package** `@nszzj/dsh-hos-scrcpy` — HarmonyOS provider | `@nszzj/dsh-hos-scrcpy` |

- Install both, not just the provider (without core this package stays inactive)
- After installing, **fully quit DSH and reopen it** (host-side changes need a restart; client-side only needs a refresh)
- Provider without core: silently inactive because its injection is unsatisfied (by design, not a bug)

## Quick start

1. Enable **developer mode + USB debugging** on the device (or `hdc tconn <ip:port>`; `hdc list targets` should list it)
2. The device appears in the DSH menu → press "mirror" on its row → the right sidebar opens that device's tab (first deployment takes about 5–10 seconds)
3. Multiple devices: one tab each, click a row to jump to its tab; press "disconnect" on a row to stop only that device
4. Quality (scale / frame rate) is under the provider group's **Connection settings** in the menu; the panel's **Settings** controls AI permissions (screenshot / controls / tap / keys / input, the last four depending on "Allow screenshots")
5. AI tools act on the **focused (visible) device**; with no focus they return an explicit error instead of guessing

## Requirements

| Dependency | Detail |
|---|---|
| DSH | DeepSeek Harness on desktop |
| **Java 8+** | runtime for the sidecar (`JAVA_HOME` / DevEco SDK preferred; can also be set in Connection settings) |
| **hdc** | ships with DevEco Studio: `<DevEco>/sdk/default/openharmony/toolchains/hdc.exe` |
| HarmonyOS device | developer mode + USB debugging (or `hdc tconn` wireless) |

## Layout

```
lib/index.js                          provider implementation (start/stop sidecar, env detection, connection config, device reporting + picture set)
resources/hosScrcpy-1.0.18-beta.jar   HOScrcpy SDK (third party, see THIRD_PARTY_NOTICES.md)
resources/out/                        sidecar build output (Main and inner classes), shipped
cordis.patch.yml                      DSH plugin manifest
Dev/src/Main.java                     sidecar source (the Java bridge between DSH and the device)
Dev/demo/                             standalone test harness (no DSH dependency, not shipped on npm)
Dev/doc.md                            development notes: architecture / conventions / what each demo does
Dev/doc-sidecar.md                    sidecar protocol, build (must use --release 8), pitfalls
```

## Verified environment

Only the combination below has been tested on real hardware; anything else may work by luck.

| Device | System | Kernel | Verified |
|---|---|---|---|
| SLY-AL00 | HarmonyOS 7.0.0.109 (SP6C00E105R3P3), API 26 | HongMeng Kernel 1.13.0 | mirroring, mouse tap and drag, the five fixed bottom keys, rotation, pause/resume on tab switch |

An earlier HarmonyOS 6.x device was also verified (mirroring / tap and long-press / keys / text input / rotation / pause-resume / multiple devices in parallel), but its exact build number was not recorded — this table exists so that every future verification gets a row.

Not verified: other brands and models, HarmonyOS watches, emulators.

## Known limitations

- **Scale / frame rate cannot change mid-connection**: reconnect; settings apply to the next connection
- **No device log stream** (hilog): the panel's "log" is plugin diagnostics
- `requestIDRFrame()` is an **empty method** in SDK 1.0.18 and cannot request a keyframe; picture rebuild relies on the sidecar's **GOP replay** (rotation while paused → config + keyframe replayed on resume)
- On retail devices the only usable mirroring path is the system service HOScrcpy uses; root / partition / allow-list approaches do not work on retail units
- Host-side changes require **fully quitting and reopening DSH**

## Development

- Architecture, conventions, what each demo does → [`Dev/doc.md`](Dev/doc.md)
- Sidecar protocol / build / troubleshooting → [`Dev/doc-sidecar.md`](Dev/doc-sidecar.md)
- **Writing a provider on top of core** → [core/Dev/doc.md](https://github.com/ns-zzj/dsh-scrcpy-core/blob/main/Dev/doc.md)

## License and third party

- This package: **MIT** (see `LICENSE`)
- Origin, signing situation and redistribution risk of `resources/hosScrcpy-1.0.18-beta.jar` (HOScrcpy SDK): see [`THIRD_PARTY_NOTICES.md`](THIRD_PARTY_NOTICES.md)
- `jmuxer.min.js` exists only in `Dev/demo/` (development only, not shipped on npm); it is still distributed with the Git repo, so it has its own notice → [`Dev/demo/THIRD_PARTY_NOTICES.md`](Dev/demo/THIRD_PARTY_NOTICES.md)
