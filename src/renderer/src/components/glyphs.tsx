import type { ReactNode } from 'react'
import {
  Cloud,
  CloudDrizzle,
  CloudFog,
  CloudLightning,
  CloudRain,
  CloudSun,
  File,
  FileArchive,
  FileCode2,
  FileImage,
  FileMusic,
  FileText,
  Film,
  Folder,
  Sun
} from 'lucide-react'

export function WeatherGlyph({ icon, size = 18 }: { icon: string; size?: number }): ReactNode {
  const props = { size, strokeWidth: 1.7 }
  switch (icon) {
    case 'sun':
      return <Sun {...props} />
    case 'cloud-sun':
      return <CloudSun {...props} />
    case 'fog':
      return <CloudFog {...props} />
    case 'drizzle':
      return <CloudDrizzle {...props} />
    case 'rain':
      return <CloudRain {...props} />
    case 'snow':
      return <CloudRain {...props} />
    case 'storm':
      return <CloudLightning {...props} />
    default:
      return <Cloud {...props} />
  }
}

const CODE_EXT = new Set(['ts', 'tsx', 'js', 'jsx', 'json', 'css', 'html', 'py', 'rs', 'go', 'java', 'c', 'cpp', 'h', 'md', 'yml', 'yaml', 'toml', 'xml', 'sh', 'ps1'])
const IMAGE_EXT = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp', 'ico', 'avif'])
const VIDEO_EXT = new Set(['mp4', 'mkv', 'mov', 'avi', 'webm', 'wmv', 'flv'])
const AUDIO_EXT = new Set(['mp3', 'flac', 'wav', 'aac', 'm4a', 'ogg', 'wma'])
const ARCHIVE_EXT = new Set(['zip', 'rar', '7z', 'tar', 'gz', 'iso', 'xz'])

export function FileGlyph({
  kind,
  ext,
  size = 18
}: {
  kind: 'file' | 'folder'
  ext: string
  size?: number
}): ReactNode {
  const props = { size, strokeWidth: 1.7 }
  if (kind === 'folder') return <Folder {...props} className="glyph-folder" />
  if (IMAGE_EXT.has(ext)) return <FileImage {...props} className="glyph-image" />
  if (VIDEO_EXT.has(ext)) return <Film {...props} className="glyph-video" />
  if (AUDIO_EXT.has(ext)) return <FileMusic {...props} className="glyph-audio" />
  if (ARCHIVE_EXT.has(ext)) return <FileArchive {...props} className="glyph-archive" />
  if (CODE_EXT.has(ext)) return <FileCode2 {...props} className="glyph-code" />
  if (ext === 'txt' || ext === 'pdf' || ext === 'doc' || ext === 'docx' || ext === 'xls' || ext === 'xlsx' || ext === 'ppt' || ext === 'pptx') {
    return <FileText {...props} className="glyph-text" />
  }
  return <File {...props} />
}
