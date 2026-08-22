interface Props {
  onClose: () => void
}

export default function EmptyRecordingDialog({ onClose }: Props) {
  return (
    <div className="confirm-backdrop" onClick={onClose}>
      <div className="confirm-dialog" role="alertdialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <p>La nota quedó vacía, no se detectó audio.</p>
        <div className="confirm-buttons">
          <button className="confirm-cancel" onClick={onClose}>
            Entendido
          </button>
        </div>
      </div>
    </div>
  )
}
