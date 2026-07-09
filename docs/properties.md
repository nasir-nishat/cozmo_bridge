# Properties (Hostfully)

| Code | Hostfully Name | Brand |
|---|---|---|
| BS | BS_JOYHASLA | Joyhasla |
| SG | SG_JOYHASLA | Joyhasla |
| SJ | SJ_JOYHASLA | Joyhasla |
| SA | SA_ACHAE | Achae |
| SWA | SWA_LEEHA | Leeha |
| JT | JT_TEVA | Teva |
| JTS | JTS_TEVA | Teva |
| HT | HT_TEVA RETREAT | Teva |
| HTA | HTA_TEVA WELLNESS | Teva |
| HTB | HTB_TEVA AERIS GARDEN | Teva |
| B9 | YT_BIRD_09 | Yeonnam |
| F9 | YT_FISH_09 | Yeonnam |
| L9 | YT_LOTUS_09 | Yeonnam |
| FB | YT_FISH_BIRD (F9+B9) | Yeonnam |
| YT | YT_LOTUS_FISH_BIRD — Master (L9+F9+B9) | Yeonnam |
| GK | GK_KELLY LUXURY | Kelly |
| GKA | GKA_KELLY ANANDA | Kelly |
| GKB | GKB_KELLY PRANA | Kelly |

## Important notes

**Master units:** GK (=GKA+GKB) and YT (=L9+F9+B9) are guest-facing bundles. Staff ops must fan out per sub-unit — never send one combined alert.

**SWA_LEEHA** is a real Hostfully property but is **not** in `PROPERTY_CODE_MAP` in `src/platforms/whatsapp/groupNaming.ts` — WA group auto-creation is not yet wired up for it.

**PROPERTY_CODE_MAP** (source of truth for WA group naming and image lookup) is in `src/platforms/whatsapp/groupNaming.ts`. It covers all properties except SWA.
