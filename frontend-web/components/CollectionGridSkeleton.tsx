import React from 'react';

interface CollectionGridSkeletonProps {
  count?: number;
}

const CollectionGridSkeleton: React.FC<CollectionGridSkeletonProps> = ({ count = 4 }) => {
  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 sm:gap-5 md:grid-cols-4">
      {Array.from({ length: count }).map((_, index) => (
        <div key={index} className="text-left">
          <div className="mb-2.5 aspect-square rounded-xl bg-neutral-100 animate-pulse" />
          <div className="mb-1 h-3 w-3/4 rounded bg-neutral-100 animate-pulse" />
          <div className="h-2.5 w-1/2 rounded bg-neutral-100 animate-pulse" />
        </div>
      ))}
    </div>
  );
};

export default CollectionGridSkeleton;
