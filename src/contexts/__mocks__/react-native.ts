type AlertButton = {
  text: string;
  style?: "default" | "cancel" | "destructive";
  onPress?: () => void;
};

type AlertCall = {
  title: string;
  message?: string;
  buttons?: AlertButton[];
};

const STORE_KEY = "__mock_react_native_alert_calls__";

function getCalls(): AlertCall[] {
  const g = globalThis as any;
  if (!g[STORE_KEY]) g[STORE_KEY] = [] as AlertCall[];
  return g[STORE_KEY] as AlertCall[];
}

export const Platform = {
  OS: "ios" as string,
  select: (obj: any) => obj.ios ?? obj.default,
};

export const StyleSheet = {
  create<T extends Record<string, unknown>>(styles: T): T {
    return styles;
  },
};

const passthrough = (_props: any) => null;
export const Modal = passthrough;
export const Pressable = passthrough;
export const Text = passthrough;
export const View = passthrough;

export const Alert = {
  alert(title: string, message?: string, buttons?: AlertButton[]) {
    getCalls().push({ title, message, buttons });
  },
  __reset() {
    getCalls().length = 0;
  },
  __calls(): AlertCall[] {
    return getCalls();
  },
  __pressButton(text: string) {
    const last = getCalls()[getCalls().length - 1];
    if (!last?.buttons) return;
    const btn = last.buttons.find((b) => b.text === text);
    if (btn?.onPress) btn.onPress();
  },
};
