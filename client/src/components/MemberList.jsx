import { X, Crown, User, Ban, ShieldOff, ArrowRightLeft, UserX } from 'lucide-react';

export default function MemberList({ members, hostId, restricted, isHost, currentUserId, onKick, onRestrict, onTransferHost, onClose, inline }) {
  const content = (
    <>
      <div className="flex items-center justify-between px-4 py-4 border-b border-dark-500 flex-shrink-0">
        <h3 className="text-white font-semibold">Thành viên ({members.length})</h3>
        {onClose && (
          <button
            onClick={onClose}
            className="p-1.5 text-dark-200 hover:text-white hover:bg-dark-600 rounded-lg transition"
          >
            <X size={16} />
          </button>
        )}
      </div>

      <div className="p-4 space-y-1 overflow-y-auto flex-1">
        {members.map((member) => {
          const isMemberHost = String(member.userId) === String(hostId);
          const isSelf = String(member.userId) === String(currentUserId);
          const isMemberRestricted = restricted?.includes(String(member.userId));

          return (
            <div
              key={member.userId}
              className="flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-dark-600 group transition"
            >
              <div className="w-8 h-8 bg-primary-600/20 rounded-full flex items-center justify-center flex-shrink-0">
                <User size={16} className="text-primary-400" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="text-sm text-white font-medium truncate">
                    {member.username}
                  </span>
                  {isMemberHost && <Crown size={12} className="text-yellow-400 flex-shrink-0" />}
                  {isMemberRestricted && <Ban size={12} className="text-red-400 flex-shrink-0" />}
                </div>
              </div>

              {isHost && !isSelf && !isMemberHost && (
                <div className="flex items-center gap-1 flex-shrink-0 opacity-0 group-hover:opacity-100 transition">
                  <button
                    onClick={() => onRestrict(member.userId)}
                    className={`w-7 h-7 flex items-center justify-center rounded-md transition ${
                      isMemberRestricted
                        ? 'text-green-400 hover:bg-green-400/10'
                        : 'text-orange-400 hover:bg-orange-400/10'
                    }`}
                    title={isMemberRestricted ? 'Bỏ hạn chế' : 'Hạn chế thêm nhạc'}
                  >
                    {isMemberRestricted ? <ShieldOff size={14} /> : <Ban size={14} />}
                  </button>
                  <button
                    onClick={() => onTransferHost(member.userId)}
                    className="w-7 h-7 flex items-center justify-center text-blue-400 hover:bg-blue-400/10 rounded-md transition"
                    title="Trao quyền Host"
                  >
                    <ArrowRightLeft size={14} />
                  </button>
                  <button
                    onClick={() => onKick(member.userId)}
                    className="w-7 h-7 flex items-center justify-center text-red-400 hover:bg-red-400/10 rounded-md transition"
                    title="Đuổi"
                  >
                    <UserX size={14} />
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </>
  );

  if (inline) {
    return <div className="flex flex-col h-full">{content}</div>;
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end" onClick={onClose}>
      <div className="absolute inset-0 bg-black/40" />
      <div
        className="relative w-72 bg-dark-700 border-l border-dark-500 h-full shadow-2xl flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {content}
      </div>
    </div>
  );
}
