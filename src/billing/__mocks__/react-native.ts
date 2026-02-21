export const Platform = {
  OS: "ios" as const,
  select: (obj: any) => obj.ios ?? obj.default,
};
