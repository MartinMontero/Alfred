Alfred beta 4 — the agent guard is now compiled in, and an evidence review surface.

What changed:
- The provider guard is no longer editable text. Which AI providers the agent can use, and
  how every agent session is launched, is now decided by compiled code — it cannot be edited
  away in a settings file. Excluded vendors are refused before the agent ever starts.
- A new Evidence panel shows analytical findings after they pass an evidence gate, with each
  finding's limits stated in full — what would change the conclusion, what could not be checked,
  where the evidence runs out. Collecting evidence for you (the investigative mode) is not part
  of this beta; it sits behind separate safety gates and is not switched on.
- Under the hood: the app is checked, on every build, against the real installed binary to
  confirm the guard actually refuses excluded providers and clears hostile settings.

Updates arrive inside the app: Settings → About → Check for updates.
Known issues: https://github.com/MartinMontero/Alfred/blob/main/docs/beta/known-issues.md
