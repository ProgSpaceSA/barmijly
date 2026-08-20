"use client";
import { useEffect, useState } from "react";
import { fetchAttachmentObjectUrl } from "@/lib/attachments";

interface Props {
  attachmentId: string;
  alt: string;
  className?: string;
  style?: React.CSSProperties;
}

/**
 * Renders a ticket attachment through the authorised download route.
 *
 * A plain `<img src="/uploads/...">` bypasses every check the API makes, so the
 * bytes are fetched with the API client and swapped in as an object URL. While
 * that is in flight the box stays blank rather than flashing a broken image.
 */
export function AttachmentImage({ attachmentId, alt, className, style }: Props) {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    let revoked = false;
    let objectUrl: string | null = null;

    fetchAttachmentObjectUrl(attachmentId)
      .then((next) => {
        objectUrl = next;
        // The effect may have been torn down mid-fetch; do not leak the handle.
        if (revoked) URL.revokeObjectURL(next);
        else setUrl(next);
      })
      .catch(() => setUrl(null));

    return () => {
      revoked = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [attachmentId]);

  if (!url) {
    return <div className={className} style={{ background: "var(--muted)", ...style }} aria-label={alt} />;
  }

  return <img src={url} alt={alt} className={className} style={style} />;
}
