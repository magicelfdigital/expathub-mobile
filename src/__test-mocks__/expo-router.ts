type RouterFn = jest.Mock;

const router: { push: RouterFn; replace: RouterFn; back: RouterFn } = {
  push: jest.fn(),
  replace: jest.fn(),
  back: jest.fn(),
};

export function __resetRouter() {
  router.push.mockReset();
  router.replace.mockReset();
  router.back.mockReset();
}

export function __getRouter() {
  return router;
}

export function useRouter() {
  return router;
}

let searchParams: Record<string, string> = {};

export function __setSearchParams(p: Record<string, string>) {
  searchParams = { ...p };
}

export function useLocalSearchParams<T = Record<string, string>>(): T {
  return searchParams as unknown as T;
}

export function useSegments() {
  return [] as string[];
}

export function useNavigation() {
  return { setOptions: () => {}, addListener: () => () => {} };
}

export const Stack = {
  Screen: ((_: any) => null) as any,
};
