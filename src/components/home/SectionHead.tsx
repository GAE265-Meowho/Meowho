import Icon, { type IconName } from "@/components/ui/Icon";
import styles from "./section.module.css";

type Props = {
  icon: IconName;
  /** Feature name from the deck, e.g. 帶我回家領養站. */
  kicker: string;
  title: React.ReactNode;
  lead?: React.ReactNode;
  id: string;
  align?: "left" | "center";
  children?: React.ReactNode;
};

/** Shared section heading: an icon + feature-name pill, a title and a lead line. */
export default function SectionHead({ icon, kicker, title, lead, id, align = "left", children }: Props) {
  return (
    <header className={`${styles.head} ${align === "center" ? styles.center : ""}`}>
      <p className={styles.kicker}>
        <Icon name={icon} size={16} />
        {kicker}
      </p>
      <h2 id={id}>{title}</h2>
      {lead && <p className={styles.lead}>{lead}</p>}
      {children}
    </header>
  );
}
