import { useEffect, useState } from 'react';
import { Sparkles, ArrowRight, Pencil, Upload } from 'lucide-react';

interface Sample {
  id: string;
  title: string;
  subtitle: string;
  tag: string;
  originalHtml: string;
  extractedHtml: string;
}

interface Props {
  /** Scrolls to / focuses the upload card so a visitor can try their own file. */
  onTryYourOwn?: () => void;
}

/**
 * Public sample gallery shown on the home screen to everyone (signed in or not).
 * Loads static seed data from /public/samples/samples.json and renders each
 * pre-converted document as an original page next to the extracted, editable
 * text — so a first-time visitor sees what the tool does without uploading.
 */
export default function SampleGallery({ onTryYourOwn }: Props) {
  const [samples, setSamples] = useState<Sample[]>([]);
  const [active, setActive] = useState(0);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch('/samples/samples.json')
      .then(r => (r.ok ? r.json() : Promise.reject(new Error('not found'))))
      .then((data: { samples?: Sample[] }) => {
        if (cancelled) return;
        setSamples(Array.isArray(data.samples) ? data.samples : []);
      })
      .catch(() => { if (!cancelled) setFailed(true); });
    return () => { cancelled = true; };
  }, []);

  if (failed || samples.length === 0) return null;

  const current = samples[Math.min(active, samples.length - 1)];

  return (
    <section className="sample-gallery" aria-label="Example conversions">
      <div className="sample-gallery-head">
        <div className="home-section-header" style={{ marginBottom: 0 }}>
          <Sparkles size={13} /><span>See it in action</span>
        </div>
        <p className="sample-gallery-sub">
          Real output from the extractor — no sign-up needed. Pick an example:
        </p>
      </div>

      <div className="sample-tabs" role="tablist">
        {samples.map((s, i) => (
          <button
            key={s.id}
            role="tab"
            aria-selected={i === active}
            className={`sample-tab${i === active ? ' sample-tab--active' : ''}`}
            onClick={() => setActive(i)}
          >
            <span className="sample-tab-title">{s.title}</span>
            <span className="sample-tab-tag">{s.tag}</span>
          </button>
        ))}
      </div>

      <div className="sample-split">
        <div className="sample-pane">
          <div className="sample-pane-label">Original page</div>
          <div className="sample-paper">
            <div
              className="sample-doc-body"
              dangerouslySetInnerHTML={{ __html: current.originalHtml }}
            />
          </div>
        </div>

        <div className="sample-arrow" aria-hidden="true">
          <ArrowRight size={20} />
        </div>

        <div className="sample-pane">
          <div className="sample-pane-label sample-pane-label--out">
            Extracted &amp; editable
            <span className="sample-edit-hint"><Pencil size={11} /> click to edit</span>
          </div>
          <div className="sample-extracted">
            <div
              className="sample-doc-body"
              contentEditable
              suppressContentEditableWarning
              spellCheck={false}
              dangerouslySetInnerHTML={{ __html: current.extractedHtml }}
            />
          </div>
        </div>
      </div>

      {onTryYourOwn && (
        <div className="sample-cta">
          <button className="sample-cta-btn" onClick={onTryYourOwn}>
            <Upload size={15} />
            <span>Try it with your own document</span>
            <ArrowRight size={15} />
          </button>
        </div>
      )}
    </section>
  );
}
