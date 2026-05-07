import * as React from "react";

function makeIcon(name: string) {
  const C = (props: any) => React.createElement(name, props);
  C.displayName = name;
  return C;
}

export const Ionicons = makeIcon("Ionicons");
export const MaterialIcons = makeIcon("MaterialIcons");
export const FontAwesome = makeIcon("FontAwesome");
export const Feather = makeIcon("Feather");
export const MaterialCommunityIcons = makeIcon("MaterialCommunityIcons");
export const AntDesign = makeIcon("AntDesign");
export const Entypo = makeIcon("Entypo");

export default {
  Ionicons,
  MaterialIcons,
  FontAwesome,
  Feather,
  MaterialCommunityIcons,
  AntDesign,
  Entypo,
};
