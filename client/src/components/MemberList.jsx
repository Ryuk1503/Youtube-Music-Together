import { X, Crown, User } from 'lucide-react';

export default function MemberList({ members, hostId, onClose }) {
  return (
    <div className="fixed inset-0 z-50 flex justify-end" onClick={onClose}>
      <div className="absolute inset-0 bg-black/40" />
      <div
        className="relative w-72 bg-dark-700 border-l border-dark-500 h-full shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-4 border-b border-dark-500">
          <h3 className="text-white font-semibold">Thành viên ({members.length})</h3>
          <button
            onClick={onClose}
            className="p-1.5 text-dark-200 hover:text-white hover:bg-dark-600 rounded-lg transition"
          >
            <X size={16} />
          </button>
        </div>

        <div className="p-4 space-y-2 overflow-y-auto h-[calc(100%-60px)]">
          {members.map((member) => (
            <div
              key={member.userId}
              className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-dark-600 transition"
            >
              <div className="w-8 h-8 bg-primary-600/20 rounded-full flex items-center justify-center flex-shrink-0">
                <User size={16} className="text-primary-400" />
              </div>
              <span className="text-sm text-white font-medium truncate flex-1">
                {member.username}
              </span>
              {member.userId === hostId && (
                <Crown size={14} className="text-yellow-400 flex-shrink-0" />
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
