interface Props {
  name?: string;
  personId?: string;
  /** Person id of the signed-in user. */
  me?: string;
}

/** Highlights the cell when the signed-in user is the person named. */
export default function PersonCell({ name, personId, me }: Props) {
  if (!name) return <>—</>;
  const isMe = Boolean(me && personId && me.toLowerCase() === personId.toLowerCase());
  return <span className={isMe ? 'person-me' : undefined}>{name}</span>;
}
