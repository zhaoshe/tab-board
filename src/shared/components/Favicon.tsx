import {
  cloneElement,
  useEffect,
  useState,
  type ImgHTMLAttributes,
  type ReactElement,
} from 'react';

export function Favicon({
  src,
  size,
  className,
  fallback,
  loading = 'lazy',
}: {
  src?: string | null;
  size: number;
  className?: string;
  fallback: ReactElement;
  loading?: ImgHTMLAttributes<HTMLImageElement>['loading'];
}) {
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setFailed(false);
  }, [src]);

  return (
    <span
      className={['tabboard-favicon', className].filter(Boolean).join(' ')}
      style={{ width: size, height: size }}
      aria-hidden="true"
    >
      {src && !failed ? (
        <img
          src={src}
          alt=""
          width={size}
          height={size}
          loading={loading}
          onError={() => setFailed(true)}
        />
      ) : cloneElement(fallback, {
        'aria-hidden': true,
        focusable: false,
        size,
      })}
    </span>
  );
}
