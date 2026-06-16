import { Feather } from '@expo/vector-icons';

type IconName =
  | 'mic'
  | 'disc'
  | 'square'
  | 'play'
  | 'pause'
  | 'check'
  | 'trash-2'
  | 'file-text'
  | 'book-open'
  | 'layers'
  | 'user'
  | 'settings'
  | 'plus'
  | 'cloud'
  | 'mail'
  | 'check-circle'
  | 'alert-circle'
  | 'log-out'
  | 'refresh-cw'
  | 'x'
  | 'share-2'
  | 'camera'
  | 'chevron-right';

export function Icon({
  name,
  size = 20,
  color = '#20160f',
}: {
  name: IconName;
  size?: number;
  color?: string;
}) {
  return <Feather color={color} name={name} size={size} />;
}
