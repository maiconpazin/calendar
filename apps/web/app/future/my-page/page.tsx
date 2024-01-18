import MyPage from "@pages/my-page";
import { _generateMetadata } from "app/_utils";

export const generateMetadata = async () =>
  await _generateMetadata(
    (t) => t("my_page_page_title"),
    (t) => t("my_page_page_subtitle")
  );

export default MyPage;
