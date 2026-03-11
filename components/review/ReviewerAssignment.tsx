'use client';

import { useState, useEffect } from 'react';
import { UserPlus, X, Check, Clock, XCircle, ThumbsUp, ThumbsDown } from 'lucide-react';

interface User {
  id: string;
  displayName: string | null;
  avatar: string | null;
  username?: string;
}

interface Assignment {
  id: string;
  status: string;
  userId: string;
  user: User;
  reviewedAt: string | null;
}

interface ReviewerAssignmentProps {
  reviewItemId: string;
  assignments: Assignment[];
  currentUserId?: string;
  onAssign?: (userIds: string[]) => Promise<void>;
  onRemove?: (userId: string) => Promise<void>;
  onApprove?: () => Promise<void>;
  onReject?: (reason?: string) => Promise<void>;
  readOnly?: boolean;
}

export function ReviewerAssignment({
  reviewItemId,
  assignments,
  currentUserId,
  onAssign,
  onRemove,
  onApprove,
  onReject,
  readOnly = false,
}: ReviewerAssignmentProps) {
  const [isAdding, setIsAdding] = useState(false);
  const [users, setUsers] = useState<User[]>([]);
  const [selectedUserIds, setSelectedUserIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [reviewLoading, setReviewLoading] = useState(false);

  // Check if current user is an assigned reviewer with pending status
  const currentUserAssignment = currentUserId 
    ? assignments.find(a => a.userId === currentUserId)
    : null;
  const canReview = currentUserAssignment?.status === 'pending';

  // Fetch available users when opening add dialog
  useEffect(() => {
    if (isAdding) {
      fetch('/api/users')
        .then(res => res.json())
        .then(data => setUsers(Array.isArray(data) ? data : []))
        .catch(() => setUsers([]));
    }
  }, [isAdding]);

  const assignedUserIds = assignments.map(a => a.userId);
  const availableUsers = users.filter(u => !assignedUserIds.includes(u.id));

  const handleAssign = async () => {
    if (!onAssign || selectedUserIds.length === 0) return;
    
    setLoading(true);
    try {
      await onAssign(selectedUserIds);
      setSelectedUserIds([]);
      setIsAdding(false);
    } finally {
      setLoading(false);
    }
  };

  const handleRemove = async (userId: string) => {
    if (!onRemove) return;
    await onRemove(userId);
  };

  const handleApprove = async () => {
    if (!onApprove || reviewLoading) return;
    setReviewLoading(true);
    try {
      await onApprove();
    } finally {
      setReviewLoading(false);
    }
  };

  const handleReject = async () => {
    if (!onReject || reviewLoading) return;
    setReviewLoading(true);
    try {
      await onReject();
    } finally {
      setReviewLoading(false);
    }
  };

  const toggleUser = (userId: string) => {
    setSelectedUserIds(prev => 
      prev.includes(userId)
        ? prev.filter(id => id !== userId)
        : [...prev, userId]
    );
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'approved': return <Check className="w-3 h-3 text-green-500" />;
      case 'rejected': return <XCircle className="w-3 h-3 text-red-500" />;
      default: return <Clock className="w-3 h-3 text-yellow-500" />;
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'approved': return 'Approved';
      case 'rejected': return 'Rejected';
      default: return 'Pending';
    }
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-xs text-zinc-500 uppercase tracking-wide">Reviewers</span>
        {!readOnly && !isAdding && (
          <button
            onClick={() => setIsAdding(true)}
            className="flex items-center gap-1 text-xs text-blue-500 hover:text-blue-400"
          >
            <UserPlus className="w-3 h-3" />
            Assign
          </button>
        )}
      </div>

      {/* Your Review Actions (if you're an assigned reviewer with pending status) */}
      {canReview && onApprove && onReject && (
        <div className="flex gap-2 mb-3">
          <button
            onClick={handleApprove}
            disabled={reviewLoading}
            className="flex-1 flex items-center justify-center gap-1 px-3 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 disabled:opacity-50 text-sm"
          >
            <ThumbsUp className="w-4 h-4" />
            Approve
          </button>
          <button
            onClick={handleReject}
            disabled={reviewLoading}
            className="flex-1 flex items-center justify-center gap-1 px-3 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 disabled:opacity-50 text-sm"
          >
            <ThumbsDown className="w-4 h-4" />
            Request Changes
          </button>
        </div>
      )}

      {/* Current assignments */}
      {assignments.length > 0 ? (
        <div className="space-y-1">
          {assignments.map((assignment) => (
            <div
              key={assignment.id}
              className={`flex items-center justify-between p-2 bg-zinc-800 rounded-lg group ${
                assignment.userId === currentUserId ? 'ring-1 ring-blue-500/50' : ''
              }`}
            >
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 rounded-full bg-zinc-700 flex items-center justify-center text-xs overflow-hidden">
                  {assignment.user.avatar ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={assignment.user.avatar} alt="" className="w-full h-full object-cover" />
                  ) : (
                    assignment.user.displayName?.charAt(0) || '?'
                  )}
                </div>
                <span className="text-sm text-white">
                  {assignment.user.displayName || assignment.user.username}
                  {assignment.userId === currentUserId && (
                    <span className="text-xs text-zinc-400 ml-1">(you)</span>
                  )}
                </span>
                <span className="flex items-center gap-1 text-xs text-zinc-500">
                  {getStatusIcon(assignment.status)}
                  {getStatusLabel(assignment.status)}
                </span>
              </div>
              {!readOnly && (
                <button
                  onClick={() => handleRemove(assignment.userId)}
                  className="opacity-0 group-hover:opacity-100 p-1 text-zinc-500 hover:text-red-500 transition-all"
                >
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>
          ))}
        </div>
      ) : (
        <p className="text-xs text-zinc-500 italic">No reviewers assigned</p>
      )}

      {/* Add reviewer dialog */}
      {isAdding && (
        <div className="p-3 bg-zinc-800 rounded-lg space-y-3">
          <div className="text-sm text-white font-medium">Select Reviewers</div>
          
          {availableUsers.length === 0 ? (
            <p className="text-xs text-zinc-500">No available users to assign</p>
          ) : (
            <div className="max-h-40 overflow-y-auto space-y-1">
              {availableUsers.map((user) => (
                <label
                  key={user.id}
                  className="flex items-center gap-2 p-2 rounded hover:bg-zinc-700 cursor-pointer"
                >
                  <input
                    type="checkbox"
                    checked={selectedUserIds.includes(user.id)}
                    onChange={() => toggleUser(user.id)}
                    className="rounded border-zinc-600 bg-zinc-700 text-blue-500 focus:ring-blue-500"
                  />
                  <div className="w-6 h-6 rounded-full bg-zinc-600 flex items-center justify-center text-xs overflow-hidden">
                    {user.avatar ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={user.avatar} alt="" className="w-full h-full object-cover" />
                    ) : (
                      user.displayName?.charAt(0) || '?'
                    )}
                  </div>
                  <span className="text-sm text-white">{user.displayName || user.username}</span>
                </label>
              ))}
            </div>
          )}

          <div className="flex justify-end gap-2">
            <button
              onClick={() => {
                setIsAdding(false);
                setSelectedUserIds([]);
              }}
              className="px-3 py-1 text-xs text-zinc-400 hover:text-white"
            >
              Cancel
            </button>
            <button
              onClick={handleAssign}
              disabled={loading || selectedUserIds.length === 0}
              className="px-3 py-1 text-xs bg-blue-500 text-white rounded hover:bg-blue-600 disabled:opacity-50"
            >
              {loading ? 'Assigning...' : `Assign (${selectedUserIds.length})`}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default ReviewerAssignment;
