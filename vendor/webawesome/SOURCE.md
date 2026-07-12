# Web Awesome vendor provenance

- Package: `@awesome.me/webawesome@3.10.0`
- Registry tarball: `https://registry.npmjs.org/@awesome.me/webawesome/-/webawesome-3.10.0.tgz`
- npm integrity: `sha512-QrVKGTiz9OhtIoDic7RF6o1x5ShnJI7jgxK93uoSBh3INYlUyejKYXohXqpJ2cgjIJqfo0jMSQygd1Ty96QOMA==`
- Tarball SHA-256: `95487f23ce9363fad926e27752b7538349a4f327d546cab130f5178798697796`
- Vendored source directory: package `dist-cdn/` copied to `vendor/webawesome/dist/`

## Local patch

`dist/styles/themes/awesome.css` removes the `fonts.bunny.net` `@import`. ZipTab extension pages must remain self-contained and use local/system fonts only.

`SHA256SUMS` records the final vendored tree after this patch. It detects local checkout drift, but it is not an independent trust anchor because the runtime and manifest live in the same repository. Regenerate it only when intentionally updating Web Awesome or the documented local patch.

Run `npm run verify:vendor` with network access to compare this metadata against executable version/URL/SRI/SHA-256 pins, fetch npm registry metadata and the pinned tarball with bounded input limits, reject unsafe archive entries before extraction, apply only the remote-font removal patch, and compare the complete patched upstream tree with `vendor/webawesome/dist/`.
