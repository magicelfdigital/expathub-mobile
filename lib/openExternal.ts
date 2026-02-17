import * as WebBrowser from "expo-web-browser";
import { Linking, Platform } from "react-native";

export async function openExternal(url: string) {
  if (Platform.OS !== "web") {
    await WebBrowser.openBrowserAsync(url, {
      presentationStyle: WebBrowser.WebBrowserPresentationStyle.PAGE_SHEET,
      enableBarCollapsing: true,
      showTitle: true,
    });
    return;
  }

  Linking.openURL(url);
}
