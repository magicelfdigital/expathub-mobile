export const Platform = {
  OS: "ios" as string,
  select: (obj: any) => obj.ios ?? obj.default,
};
