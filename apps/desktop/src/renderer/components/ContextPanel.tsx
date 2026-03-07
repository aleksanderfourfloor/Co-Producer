import type { CoproducerState } from '@shared/types';

interface ContextPanelProps {
  state: CoproducerState;
  importingReference: boolean;
  onReferenceSelected: (file: File) => Promise<void>;
}

export function ContextPanel({
  state,
  importingReference,
  onReferenceSelected
}: ContextPanelProps): JSX.Element {
  const selectionTrack = state.snapshot.tracks.find(
    (track) => track.id === state.snapshot.selection.trackId
  );

  return (
    <section className="panel panel-context">
      <div className="panel-header">
        <div>
          <p className="eyebrow">Live Context</p>
          <h2>Set snapshot</h2>
        </div>
        <span className={`status-pill status-${state.bridgeStatus}`}>
          {state.bridgeStatus === 'connected' ? 'Live bridge online' : 'Mock snapshot'}
        </span>
      </div>

      <div className="context-grid">
        <article className="metric-card">
          <span>Tempo</span>
          <strong>{state.snapshot.tempo} BPM</strong>
        </article>
        <article className="metric-card">
          <span>Time Signature</span>
          <strong>
            {state.snapshot.timeSignature[0]}/{state.snapshot.timeSignature[1]}
          </strong>
        </article>
        <article className="metric-card">
          <span>Selection</span>
          <strong>{selectionTrack?.name ?? 'None'}</strong>
        </article>
        <article className="metric-card">
          <span>Revision</span>
          <strong>{state.snapshot.setRevision}</strong>
        </article>
      </div>

      <div className="subsection">
        <div className="subsection-header">
          <h3>Locators</h3>
          <p>{state.snapshot.locators.length} sections indexed</p>
        </div>
        <div className="chip-row">
          {state.snapshot.locators.map((locator) => (
            <span className="chip" key={locator.id}>
              {locator.name} · beat {locator.beat}
            </span>
          ))}
        </div>
      </div>

      <div className="subsection">
        <div className="subsection-header">
          <h3>Tracks</h3>
          <p>{state.snapshot.tracks.length} tracks indexed</p>
        </div>
        <div className="track-list">
          {state.snapshot.tracks.map((track) => (
            <article className="track-card" key={track.id}>
              <header>
                <div>
                  <strong>{track.name}</strong>
                  <span>{track.type}</span>
                </div>
                <span className="role-tag">{track.role}</span>
              </header>
              <p>
                {track.clips.length} clips · {track.devices.length} devices
              </p>
            </article>
          ))}
        </div>
      </div>

      <div className="subsection">
        <div className="subsection-header">
          <h3>Reference audio</h3>
          <label className="upload-button">
            <input
              accept="audio/*"
              disabled={importingReference}
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) {
                  void onReferenceSelected(file);
                  event.target.value = '';
                }
              }}
              type="file"
            />
            {importingReference ? 'Analyzing...' : 'Import Reference'}
          </label>
        </div>
        <div className="reference-list">
          {state.references.length === 0 ? (
            <p className="muted">No reference files imported yet.</p>
          ) : null}
          {state.references.map((reference) => (
            <article className="reference-card" key={reference.id}>
              <header>
                <strong>{reference.fileName}</strong>
                <span>{Math.round(reference.features.durationSeconds)}s</span>
              </header>
              <p>
                RMS {reference.features.rms} · Peak {reference.features.peak} · Centroid{' '}
                {Math.round(reference.features.spectralCentroid)} Hz
              </p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
