# Design System Master File

> **LOGIC:** When building a specific page, first check `design-system/pages/[page-name].md`.
> If that file exists, its rules **override** this Master file.
> If not, strictly follow the rules below.

---

**Project:** WiFi Care Mobile
**Generated:** 2026-09-30 03:55:47
**Category:** Plateforme de gestion d'interventions réseau (propriétaire de zone, technicien, régie)
**Design Dials:** Variance 5/10 (Balanced / Modern) | Motion 5/10 (Standard) | Density 6/10 (Standard)

> **Portée de ce document.** La palette, l'échelle d'espacement, les rayons et
> les ombres décrites ci-dessous correspondent à l'implémentation. La
> typographie et le style graphique ont été réécrits pour décrire le code réel :
> la version d'origine annonçait une police et un style que ni le web ni le
> mobile n'utilisent. Voir « Écarts constatés » en bas de fichier.

---

## Global Rules

### Color Palette

| Role | Hex | CSS Variable |
|------|-----|--------------|
| Primary | `#0D9488` | `--color-primary` |
| On Primary | `#000000` | `--color-on-primary` |
| Secondary | `#2DD4BF` | `--color-secondary` |
| On Secondary | `#0F172A` | `--color-on-secondary` |
| Accent/CTA | `#D97706` | `--color-accent` |
| On Accent/CTA | `#000000` | `--color-on-accent` |
| Background | `#F0FDFA` | `--color-background` |
| Foreground | `#134E4A` | `--color-foreground` |
| Card | `#FFFFFF` | `--color-card` |
| Card Foreground | `#134E4A` | `--color-card-foreground` |
| Muted | `#E8F1F4` | `--color-muted` |
| Muted Foreground | `#475569` | `--color-muted-foreground` |
| Border | `#5EEAD4` | `--color-border` |
| Destructive | `#DC2626` | `--color-destructive` |
| On Destructive | `#FFFFFF` | `--color-on-destructive` |
| Ring | `#0D9488` | `--color-ring` |

**Color Notes:** teal d'intervention, ambre pour les actions Secondary du
client, rouge réservé à la destructive. Ces trois valeurs correspondent à
`mobile/lib/src/core/theme/app_colors.dart` ; le web utilise une palette bleue,
voir « Écarts constatés ».

### Typography

Une seule famille dans tout le produit, et elle diffère selon la plateforme.

- **Web (Next.js)** — Plus Jakarta Sans. Déclarée dans `src/app/globals.css`,
  en `font-family: 'Plus Jakarta Sans', sans-serif` sur le `body`. Graisses
  400 / 500 / 600 / 700 / 800.
- **Mobile (Flutter)** — aucune police déclarée. `pubspec.yaml` ne déclare
  aucune ressource `fonts:`, et aucun `TextStyle` ne fixe `fontFamily` : le
  rendu est celui du système, Roboto sur Android.

**Google Fonts (web) :**
```
https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap
```

**CSS Import :**
```css
@import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap');
```

**Écart assumé :** le mobile n'embarque pas Plus Jakarta Sans. Aligner les deux
plateformes suppose d'ajouter les fichiers `.ttf` dans
`mobile/assets/fonts/`, de les déclarer dans `pubspec.yaml`, puis de les
référencer dans `mobile/lib/src/core/theme/app_theme.dart`. Ce n'est pas fait.

### Spacing Variables

*Density: 6/10 — Standard*

| Token | Value | Usage |
|-------|-------|-------|
| `--space-xs` | `4px` / `0.25rem` | Tight gaps |
| `--space-sm` | `8px` / `0.5rem` | Icon gaps, inline spacing |
| `--space-md` | `16px` / `1rem` | Standard padding |
| `--space-lg` | `24px` / `1.5rem` | Section padding |
| `--space-xl` | `32px` / `2rem` | Large gaps |
| `--space-2xl` | `48px` / `3rem` | Section margins |
| `--space-3xl` | `64px` / `4rem` | Hero padding |

### Shadow Depths

| Level | Value | Usage |
|-------|-------|-------|
| `--shadow-sm` | `0 1px 2px rgba(0,0,0,0.05)` | Subtle lift |
| `--shadow-md` | `0 4px 6px rgba(0,0,0,0.1)` | Cards, buttons |
| `--shadow-lg` | `0 10px 15px rgba(0,0,0,0.1)` | Modals, dropdowns |
| `--shadow-xl` | `0 20px 25px rgba(0,0,0,0.15)` | Hero images, featured cards |

---

## Component Specs

### Buttons

```css
/* Primary Button */
.btn-primary {
  background: #D97706;
  color: white;
  padding: 12px 24px;
  border-radius: 8px;
  font-weight: 600;
  transition: all 200ms ease;
  cursor: pointer;
}

.btn-primary:hover {
  opacity: 0.9;
  transform: translateY(-1px);
}

/* Secondary Button */
.btn-secondary {
  background: transparent;
  color: #0D9488;
  border: 2px solid #0D9488;
  padding: 12px 24px;
  border-radius: 8px;
  font-weight: 600;
  transition: all 200ms ease;
  cursor: pointer;
}
```

### Cards

```css
.card {
  background: #F0FDFA;
  border-radius: 12px;
  padding: 24px;
  box-shadow: var(--shadow-md);
  transition: all 200ms ease;
  cursor: pointer;
}

.card:hover {
  box-shadow: var(--shadow-lg);
  transform: translateY(-2px);
}
```

### Inputs

```css
.input {
  padding: 12px 16px;
  border: 1px solid #E2E8F0;
  border-radius: 8px;
  font-size: 16px;
  transition: border-color 200ms ease;
}

.input:focus {
  border-color: #0D9488;
  outline: none;
  box-shadow: 0 0 0 3px #0D948820;
}
```

### Modals

```css
.modal-overlay {
  background: rgba(0, 0, 0, 0.5);
  backdrop-filter: blur(4px);
}

.modal {
  background: white;
  border-radius: 16px;
  padding: 32px;
  box-shadow: var(--shadow-xl);
  max-width: 500px;
  width: 90%;
}
```

---

## Style Guidelines

**Style:** plat, mais **avec** ombres et un dégradé sur l'action principale.

**Keywords:** 2D, minimalist, clean lines, simple shapes, modern, icon-heavy

**Best For:** Web apps, mobile apps, cross-platform, startup MVPs, user-friendly, SaaS, dashboards, corporate

**Key Effects:** transitions 150-200ms ease, icônes SVG (Lucide côté web,
Material Icons côté Flutter), aucun emoji en guise d'icône.

> La version d'origine de ce document annonçait « no gradients/shadows ». Le
> code fait l'inverse des deux côtés : `--elevation-1` à `--elevation-3` et un
> `linear-gradient` sur `.btn-primary` dans `src/app/globals.css`, `AppShadows`
> en quatre profondeurs dans `mobile/lib/src/core/theme/app_theme.dart`.
> Les exemples de composants plus haut, qui portent des `box-shadow`, sont
> eux conformes au code ; c'est la ligne « Key Effects » qui ne l'était pas.

### Page Pattern

**Pattern Name:** Feature-Rich Showcase

- **Conversion Strategy:** Clear feature hierarchy. One key message per card. Strong CTA repetition.
- **CTA Placement:** Hero (sticky) + After features + Bottom
- **Section Order:** Hero (value prop) > Feature grid/cards (4-6) > Use cases or benefits > Social proof or logos > CTA

---

## Motion

> **Web uniquement.** GSAP n'est pas une dépendance du back-office : aucune
> animation du dépôt ne l'utilise. La section décrit une intention, pas une
> implémentation existante. Côté Flutter, l'équivalent est
> `AnimatedSwitcher` / `AnimatedContainer`, et le thème expose
> `prefers-reduced-motion` via `MediaQuery.disableAnimations`.

**Stagger List** (Standard) — Trigger: load or scroll | Duration: 300-450ms | Easing: `back.out(1.4)`

```js
gsap.from('.grid-item', { opacity: 0, scale: 0.92, y: 16, duration: 0.4, stagger: { each: 0.06, from: 'start', grid: 'auto' }, ease: 'back.out(1.4)' });
```

**Framework notes:** grid: 'auto' lets GSAP infer rows/columns from a CSS grid layout for a natural wave stagger; Use matchMedia('(prefers-reduced-motion: reduce)') to skip non-essential motion and render the final state immediately

- ✅ Combine with from: 'center' for a bento-grid layout to draw the eye inward first
- ❌ Don't use back.out on dense data tables; the overshoot reads as sloppy on informational UI
- ⚡ Group DOM writes; avoid interleaving layout reads (getBoundingClientRect) between staggered tweens

---

## Anti-Patterns (Do NOT Use)

- ❌ Hidden assignments
- ❌ poor mobile
- ❌ cluttered navigation

### Additional Forbidden Patterns

- ❌ **Emojis as icons** — Use SVG icons (Heroicons, Lucide, Simple Icons)
- ❌ **Missing cursor:pointer** — All clickable elements must have cursor:pointer
- ❌ **Layout-shifting hovers** — Avoid scale transforms that shift layout
- ❌ **Low contrast text** — Maintain 4.5:1 minimum contrast ratio
- ❌ **Instant state changes** — Always use transitions (150-300ms)
- ❌ **Invisible focus states** — Focus states must be visible for a11y

---

## Pre-Delivery Checklist

Before delivering any UI code, verify:

> Les cinq premières lignes sont énoncées en CSS et ne s'appliquent qu'au web.
> En Flutter, l'équivalent est : aucune image bitmap en guise d'icône
> (`Icon` Material), cible tactile d'au moins 48 dp — `kMinTouchTarget` dans
> `app_theme.dart` — et thème sombre correct (`AppTheme.dark()`).

- [ ] No emojis used as icons (use SVG instead)
- [ ] All icons from consistent icon set (Heroicons/Lucide)
- [ ] `cursor-pointer` on all clickable elements
- [ ] Hover states with smooth transitions (150-300ms)
- [ ] Light mode: text contrast 4.5:1 minimum
- [ ] Focus states visible for keyboard navigation
- [ ] `prefers-reduced-motion` respected
- [ ] Responsive: 375px, 768px, 1024px, 1440px
- [ ] No content hidden behind fixed navbars
- [ ] No horizontal scroll on mobile

---

## Écarts constatés

Relevé en septembre 2026 sur le code, pas sur ce document. Ces points
demandent un arbitrage : aucun n'a été corrigé, parce que tous touchent à
l'identité visuelle du produit.

| Point | Ce que dit ce document | Ce que fait le code |
| --- | --- | --- |
| Palette | teal `#0D9488`, ambre `#D97706` | **mobile** : teal et ambre, conformes (`app_colors.dart`). **web** : bleu `#2563EB` et indigo, non conformes (`--brand-*` dans `globals.css`) |
| Palette de fond | `#F0FDFA` (teal très pâle) | mobile : conforme. web : `#ffffff` / `#f6f8fa`, neutres |
| Typographie | Cormorant Garamond + Crimson Pro | **aucune des deux plateformes ne les utilise.** Web : Plus Jakarta Sans. Mobile : police système |
| Style | « no gradients/shadows » | contredit par les deux : `--elevation-*` et `linear-gradient` côté web, `AppShadows` en quatre profondeurs côté mobile |
| Icônes | Heroicons / Lucide | web : SVG inline. mobile : Material Icons. ni l'un ni l'autre n'est une dépendance nommée |

Le tableau des rôles en tête de fichier est le reste le plus fiable : les
couleurs, l'échelle d'espacement (4/8/16/24/32/48/64) et les quatre profondeurs
d'ombre correspondent exactement à `mobile/lib/src/core/theme/app_colors.dart` et
`app_theme.dart`.
