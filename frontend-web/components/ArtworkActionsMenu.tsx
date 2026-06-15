import React from 'react';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from './ui/dropdown-menu';

type Props = {
  disabled?: boolean;
  onEdit?: () => void;
  onDelete?: () => void;
  buttonClassName?: string;
  iconClassName?: string;
};

const ArtworkActionsMenu: React.FC<Props> = ({
  disabled,
  onEdit,
  onDelete,
  buttonClassName = 'w-9 h-9 flex items-center justify-center text-neutral-500 hover:text-neutral-900 active:text-neutral-900 transition-colors',
  iconClassName = 'w-[18px] h-[18px]',
}) => {
  if (!onEdit && !onDelete) return null;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          disabled={disabled}
          onClick={(event) => event.stopPropagation()}
          onPointerDown={(event) => event.stopPropagation()}
          className={buttonClassName}
          aria-label="Artwork actions"
        >
          <svg className={iconClassName} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <circle cx="5" cy="12" r="1.5" />
            <circle cx="12" cy="12" r="1.5" />
            <circle cx="19" cy="12" r="1.5" />
          </svg>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        className="min-w-[180px]"
        onCloseAutoFocus={(event) => event.preventDefault()}
      >
        {onEdit && (
          <DropdownMenuItem
            onSelect={(event) => {
              event.preventDefault();
              event.stopPropagation();
              onEdit();
            }}
          >
            <div className="flex items-center gap-3">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z" />
              </svg>
              <span>Edit info</span>
            </div>
          </DropdownMenuItem>
        )}
        {onDelete && (
          <DropdownMenuItem
            destructive
            onSelect={(event) => {
              event.preventDefault();
              event.stopPropagation();
              onDelete();
            }}
          >
            <div className="flex items-center gap-3">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="3 6 5 6 21 6" />
                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
              </svg>
              <span>Delete</span>
            </div>
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

export default ArtworkActionsMenu;
