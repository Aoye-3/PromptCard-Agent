# PromptCard motion graphics v1

An English motion-graphics prototype for PromptCard Manager. The project contains:

- `MasterReview`: 59-second review cut on a warm dotted background.
- `MasterAlpha`: the same cut with transparency.
- `OverlayShowcase`: a review cut demonstrating all overlays on a mock editor backdrop.
- `A-Fullscreen`: five full-frame typography clips.
- `B-Overlay`: six transparent explanatory overlays.

## Preview

```bash
npm run dev
```

## Validate and render

```bash
npm run lint
npm run still:review
npm run render:review
npm run render:alpha
npm run render:overlay-showcase
npm run render:overlays
```

Alpha output uses ProRes 4444, PNG frames, and `yuva444p10le`. The review render overrides these defaults with H.264.

<p align="center">
  <a href="https://github.com/remotion-dev/logo">
    <picture>
      <source media="(prefers-color-scheme: dark)" srcset="https://github.com/remotion-dev/logo/raw/main/animated-logo-banner-dark.apng">
      <img alt="Animated Remotion Logo" src="https://github.com/remotion-dev/logo/raw/main/animated-logo-banner-light.gif">
    </picture>
  </a>
</p>

Welcome to your Remotion project!

## Commands

**Install Dependencies**

```console
npm i
```

**Start Preview**

```console
npm run dev
```

**Render video**

```console
npx remotion render
```

**Upgrade Remotion**

```console
npx remotion upgrade
```

## Docs

Get started with Remotion by reading the [fundamentals page](https://www.remotion.dev/docs/the-fundamentals).

## Help

We provide help on our [Discord server](https://discord.gg/6VzzNDwUwV).

## Issues

Found an issue with Remotion? [File an issue here](https://github.com/remotion-dev/remotion/issues/new).

## License

Note that for some entities a company license is needed. [Read the terms here](https://github.com/remotion-dev/remotion/blob/main/LICENSE.md).
