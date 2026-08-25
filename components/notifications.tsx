export default function Notifications() {
  return (
    <div className="flex h-[80vh] items-center justify-center px-4">
      <div className="space-y-6 text-center">
        {/* Animated Loading Spinner */}
        <div className="flex justify-center">
          <div className="relative h-24 w-24">
            {/* Outer ring */}
            <div className="absolute inset-0 rounded-full border-2 border-transparent border-t-primary border-r-primary/50 animate-spin" />
            {/* Inner circle */}
            <div className="absolute inset-3 flex items-center justify-center">
              <div className="h-12 w-12 rounded-full bg-primary/20" />
            </div>
            {/* Center dot */}
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="h-3 w-3 rounded-full bg-primary animate-pulse" />
            </div>
          </div>
        </div>

        {/* Loading Text */}
        <div className="space-y-2">
          <p className="text-lg font-semibold text-foreground">Loading...</p>
          <p className="text-sm text-muted-foreground">
            Fetching your notifications
          </p>
        </div>
      </div>
    </div>
  )
}
