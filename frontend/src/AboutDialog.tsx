import { APP_VERSION } from './version'

interface Props {
  onClose: () => void
}

export default function AboutDialog({ onClose }: Props) {
  return (
    <div className="confirm-backdrop" onClick={onClose}>
      <div className="confirm-dialog about-dialog" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <img className="about-logo" src="/remind.png" alt="re.mind2" />
        <p className="about-tagline">Grabá una nota de voz y se transcribe y guarda sola.</p>
        <p className="about-version">Versión {APP_VERSION}</p>
        <div className="confirm-buttons">
          <button className="confirm-cancel" onClick={onClose}>
            Cerrar
          </button>
        </div>
      </div>
    </div>
  )
}
