import { Avatar, AvatarImage, AvatarFallback, AvatarBadge, AvatarGroup, AvatarGroupCount } from "pedimentos-v2-ds";

const PLACEHOLDER =
  "data:image/svg+xml;utf8," +
  encodeURIComponent(
    "<svg xmlns='http://www.w3.org/2000/svg' width='64' height='64'><rect width='64' height='64' fill='#D97A3F'/><text x='32' y='40' font-size='24' font-family='sans-serif' text-anchor='middle' fill='white'>AT</text></svg>"
  );

export function WithImage() {
  return (
    <Avatar>
      <AvatarImage src={PLACEHOLDER} alt="Ana Torres" />
      <AvatarFallback>AT</AvatarFallback>
    </Avatar>
  );
}

export function FallbackWithBadge() {
  return (
    <Avatar size="lg">
      <AvatarFallback>RM</AvatarFallback>
      <AvatarBadge />
    </Avatar>
  );
}

export function Group() {
  return (
    <AvatarGroup>
      <Avatar>
        <AvatarFallback>AT</AvatarFallback>
      </Avatar>
      <Avatar>
        <AvatarFallback>JL</AvatarFallback>
      </Avatar>
      <Avatar>
        <AvatarFallback>MG</AvatarFallback>
      </Avatar>
      <AvatarGroupCount>+3</AvatarGroupCount>
    </AvatarGroup>
  );
}
