# Contributing to DevicePeek

Thanks for your interest in improving DevicePeek. Contributions of all sizes are
welcome, from fixing a typo to adding a new device preset.

## Getting set up

    git clone https://github.com/Fredler21/devicepeek.git
    cd devicepeek
    npm install
    npm run dev

## Before you open a pull request

Run the production build so TypeScript type checking and the Vite bundle both pass:

    npm run build

Please keep these in mind:

- Match the existing code style. The project is strict TypeScript with no runtime dependencies.
- Keep the app a single page with no framework. DOM plus CSS is the whole point.
- Test your change in the browser at a few device sizes before submitting.

## Adding a device preset

Device presets live in `src/main.ts` inside the `PHONES` and `LAPTOPS` objects. Add
an entry with the display name and the CSS point width and height. Phones also accept
frame styling values (island, radius, screenRadius, bezel).

## Reporting a bug or idea

Open an issue at https://github.com/Fredler21/devicepeek/issues and include the URL
you were previewing, the device you selected, and what you expected to happen.

## License

By contributing, you agree that your contributions are licensed under the MIT License.
