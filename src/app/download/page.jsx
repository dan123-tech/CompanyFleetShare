import DownloadUnavailableClient from "./DownloadUnavailableClient";

export const metadata = {
  title: "Download | FleetShare",
  description: "FleetShare downloads are temporarily unavailable — contact support or return to the home page.",
};

export default function DownloadPage() {
  return <DownloadUnavailableClient />;
}
