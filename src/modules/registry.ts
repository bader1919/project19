import { BookOpen, GraduationCap, PlaySquare, type LucideIcon } from "lucide-react";

/**
 * Content modules shown in the sidebar. Each module is one item `type` in the
 * database. To add Wikis or Courses later: build the module's pages, add its
 * details table (like video_details), and flip `enabled` to true.
 */
export interface ContentModule {
  type: "video" | "wiki" | "course" | "article";
  label: string;
  path: string;
  icon: LucideIcon;
  enabled: boolean;
}

export const MODULES: ContentModule[] = [
  { type: "video", label: "Videos", path: "/videos", icon: PlaySquare, enabled: true },
  { type: "wiki", label: "Wikis", path: "/wikis", icon: BookOpen, enabled: false },
  { type: "course", label: "Courses", path: "/courses", icon: GraduationCap, enabled: false },
];

export const moduleFor = (type: string) => MODULES.find((m) => m.type === type);
