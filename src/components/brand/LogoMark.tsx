import logoSrc from '@/assets/brand/bei-logo.png';

type Props = {
  className?: string;
};

export default function LogoMark({ className }: Props) {
  return (
    <img
      src={logoSrc}
      alt="B.E.I Team+"
      className={className}
      loading="eager"
      decoding="async"
    />
  );
}
