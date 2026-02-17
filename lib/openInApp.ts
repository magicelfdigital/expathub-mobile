import * as Linking from "expo-linking";
import * as WebBrowser from "expo-web-browser";

export async function openInApp(url: string) {
  if (!url) return;

  const safeUrl =
    url.startsWith("http://") || url.startsWith("https://")
      ? url
      : `https://${url}`;

  try {
    await WebBrowser.openBrowserAsync(safeUrl);
    return;
  } catch (e) {
    // fall through
  }

  try {
    await Linking.openURL(safeUrl);
  } catch (e) {
    // ignore
  }
}
