// Suspense fallback for the initial news fetch (see src/app/page.tsx). Card
// dimensions/spacing are copied from ArticleCard.tsx and HomeClient.tsx's
// grid so the real content swaps in with zero layout shift.

function PulseBlock({ className = "" }: { className?: string }) {
  return (
    <div className={`animate-pulse rounded bg-slate-200 dark:bg-slate-700 ${className}`} />
  );
}

function FeaturedCardSkeleton() {
  return (
    <div className="flex flex-col overflow-hidden rounded-2xl border border-slate-200 dark:border-[#34383f] bg-white dark:bg-[#25282d] p-4 md:p-6 gap-6 md:grid md:grid-cols-12">
      <div className="relative overflow-hidden rounded-xl aspect-video w-full md:col-span-7">
        <PulseBlock className="absolute inset-0 rounded-xl" />
      </div>
      <div className="flex flex-col justify-between md:col-span-5 space-y-4 pt-2 md:pt-0">
        <div className="space-y-2.5">
          <div className="flex items-center space-x-2">
            <PulseBlock className="h-3 w-20" />
            <PulseBlock className="h-3 w-16" />
          </div>
          <div className="space-y-2">
            <PulseBlock className="h-7 w-full" />
            <PulseBlock className="h-7 w-4/5" />
          </div>
          <div className="space-y-1.5 pt-1">
            <PulseBlock className="h-3 w-full" />
            <PulseBlock className="h-3 w-full" />
            <PulseBlock className="h-3 w-2/3" />
          </div>
        </div>
        <div className="pt-3 flex items-center justify-between border-t border-slate-100 dark:border-[#34383f] mt-4">
          <PulseBlock className="h-4 w-24" />
          <PulseBlock className="h-7 w-7 rounded-lg" />
        </div>
      </div>
    </div>
  );
}

function StoryCardSkeleton() {
  return (
    <div className="flex flex-col overflow-hidden rounded-2xl border border-slate-200 dark:border-[#34383f] bg-white dark:bg-[#25282d] p-4">
      <div className="relative overflow-hidden rounded-xl aspect-[16/10] w-full">
        <PulseBlock className="absolute inset-0 rounded-xl" />
      </div>
      <div className="flex flex-col justify-between space-y-3 mt-3">
        <div className="space-y-2.5">
          <div className="flex items-center space-x-2">
            <PulseBlock className="h-3 w-16" />
            <PulseBlock className="h-3 w-12" />
          </div>
          <div className="space-y-1.5">
            <PulseBlock className="h-4 w-full" />
            <PulseBlock className="h-4 w-4/5" />
          </div>
          <div className="space-y-1.5">
            <PulseBlock className="h-3 w-full" />
            <PulseBlock className="h-3 w-3/4" />
          </div>
        </div>
        <div className="pt-3 flex items-center justify-between border-t border-slate-100 dark:border-[#34383f] mt-4">
          <PulseBlock className="h-3 w-14" />
          <PulseBlock className="h-6 w-6 rounded-lg" />
        </div>
      </div>
    </div>
  );
}

export default function NewsSkeletonGrid() {
  return (
    <div className="mx-auto w-full max-w-[1500px] px-3 py-6 sm:px-4 md:px-6 lg:px-10 space-y-8 sm:space-y-10 lg:space-y-12">
      <section className="space-y-3 sm:space-y-4">
        <PulseBlock className="h-3.5 w-40" />
        <FeaturedCardSkeleton />
      </section>

      <section className="space-y-4 sm:space-y-6">
        <PulseBlock className="h-4 w-32" />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4 sm:gap-6">
          {Array.from({ length: 4 }).map((_, i) => (
            <StoryCardSkeleton key={i} />
          ))}
        </div>
      </section>
    </div>
  );
}
