import {
  Activity,
  AlignLeft,
  ArrowRight,
  AudioLines,
  BookOpen,
  Check,
  ChevronRight,
  CircleCheck,
  CircleHelp,
  ClipboardList,
  Clock,
  Download,
  FileAudio,
  FileText,
  Globe,
  Headphones,
  Info,
  LayoutDashboard,
  ListChecks,
  Mic,
  Pause,
  Play,
  Radio,
  RefreshCw,
  ShieldCheck,
  Square,
  TriangleAlert,
  Upload,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react'

const icons = {
  pulse: Activity,
  home: LayoutDashboard,
  mic: Mic,
  upload: Upload,
  file: FileAudio,
  fileText: FileText,
  summary: ClipboardList,
  list: ListChecks,
  transcript: AlignLeft,
  wave: AudioLines,
  radio: Radio,
  arrow: ArrowRight,
  chevron: ChevronRight,
  check: Check,
  checkCircle: CircleCheck,
  shield: ShieldCheck,
  info: Info,
  help: CircleHelp,
  close: X,
  refresh: RefreshCw,
  clock: Clock,
  headphones: Headphones,
  stop: Square,
  download: Download,
  alert: TriangleAlert,
  globe: Globe,
  book: BookOpen,
  play: Play,
  pause: Pause,
  volume: Volume2,
  muted: VolumeX,
}

export default function Icon({ name, size = 18, className = '', ...props }) {
  const Component = icons[name] || Activity
  return (
    <Component
      size={size}
      strokeWidth={1.65}
      className={className}
      aria-hidden="true"
      focusable="false"
      {...props}
    />
  )
}
