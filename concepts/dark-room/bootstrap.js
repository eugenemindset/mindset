// Keep assets addressable from the scene modules.
const assetNames = [
  "assets/SF-Pro.ttf",
  "assets/figma-ui/panel-marker-body.svg",
  "assets/figma-ui/fresnel.svg",
  "assets/figma-ui/back.svg",
  "assets/figma-ui/live.svg",
  "assets/figma-ui/minus.svg",
  "assets/figma-ui/plus.svg",
  "assets/figma-ui/panel.svg",
  "assets/figma-ui/cob.svg",
  "assets/device.png",
  "assets/figma-ui/fresnel-selected.svg",
  "assets/figma-ui/fresnel-marker.svg",
  "assets/figma-ui/panel-marker.svg",
  "assets/SF-Pro-License.rtf",
  "assets/page-background.jpg"
];
globalThis.__duoAssets = Object.fromEntries(assetNames.map(name => [name, new URL(name, import.meta.url).href]));

document.body.style.visibility = "";
try {
  await import("./prototype-cursor.js");
  await import("./ui-motion.js");
  await import("./app.js?v=open-1");
} catch (error) {
  console.error('Dark Room failed to start:', error);
  const message = document.createElement('p');
  message.style.cssText = 'color:#ccc;font:16px/1.5 system-ui;text-align:center;padding:32px';
  message.textContent = 'Не удалось открыть макет в этом браузере. Попробуйте актуальную версию Chrome или Edge.';
  document.body.append(message);
}
