interface Props {
  onConfirm: () => void;
  onCancel:  () => void;
}

export default function DeleteConfirmModal({ onConfirm, onCancel }: Props) {
  return (
    <div className="del-confirm-modal" onClick={onCancel}>
      <div className="del-confirm-box" onClick={e => e.stopPropagation()}>
        <p className="del-confirm-title">Delete?</p>
        <div className="del-confirm-btns">
          <button className="del-confirm-cancel" onClick={onCancel}>Cancel</button>
          <button className="del-confirm-delete" onClick={onConfirm}>Delete</button>
        </div>
      </div>
    </div>
  );
}
