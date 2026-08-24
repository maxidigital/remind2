import { APP_VERSION } from './version'

interface Props {
  email: string
  onClose: () => void
}

export default function AboutDialog({ email, onClose }: Props) {
  return (
    <div className="confirm-backdrop" onClick={onClose}>
      <div className="confirm-dialog about-dialog" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <img className="about-icon" src="/remind_circle.png" alt="" />
        <img className="about-logo" src="/remind.png" alt="re.mind2" />
        <p className="about-version">Versión {APP_VERSION}</p>
        <p className="about-email">{email}</p>
      </div>
    </div>
  )
}
