import { TESTING_DIR } from "@/configs";
import { HumanMessage } from "@langchain/core/messages";
import fs from "fs/promises";

const historyPath = TESTING_DIR + "local-testing.json";
const slideTemplatesData = [
  {
    s3Key:
      "d6b8d1d4-095c-4cfc-902f-546b3af99716/projects/e0b3a85d-2ae0-4da7-a3c7-cb2a483ed6df/presentations/1r28-9UhR-HNWhQTlw9hQvL47lrrkcPBsKOJFH9k3GL8/slides/thumbnail_p1.png",
    content: "",
    publicUrl:
      "https://sequesto-portal-dev-storage.s3.eu-central-1.amazonaws.com/d6b8d1d4-095c-4cfc-902f-546b3af99716/projects/e0b3a85d-2ae0-4da7-a3c7-cb2a483ed6df/presentations/1r28-9UhR-HNWhQTlw9hQvL47lrrkcPBsKOJFH9k3GL8/slides/thumbnail_p1.png?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Content-Sha256=UNSIGNED-PAYLOAD&X-Amz-Credential=AKIAUEVNDKJY5PF3524Y%2F20250814%2Feu-central-1%2Fs3%2Faws4_request&X-Amz-Date=20250814T080522Z&X-Amz-Expires=604800&X-Amz-Signature=bb7ba4854bf9e9aef76dc4ead235670ba2433476aa552c9de5a725fef0f0f3fc&X-Amz-SignedHeaders=host&x-amz-checksum-mode=ENABLED&x-id=GetObject",
    layoutName: "Cover Slide",
    slideObjectId: "p1",
    originalContent: "",
  },
  {
    s3Key:
      "d6b8d1d4-095c-4cfc-902f-546b3af99716/projects/e0b3a85d-2ae0-4da7-a3c7-cb2a483ed6df/presentations/1r28-9UhR-HNWhQTlw9hQvL47lrrkcPBsKOJFH9k3GL8/slides/thumbnail_p2.png",
    content: "",
    publicUrl:
      "https://sequesto-portal-dev-storage.s3.eu-central-1.amazonaws.com/d6b8d1d4-095c-4cfc-902f-546b3af99716/projects/e0b3a85d-2ae0-4da7-a3c7-cb2a483ed6df/presentations/1r28-9UhR-HNWhQTlw9hQvL47lrrkcPBsKOJFH9k3GL8/slides/thumbnail_p2.png?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Content-Sha256=UNSIGNED-PAYLOAD&X-Amz-Credential=AKIAUEVNDKJY5PF3524Y%2F20250814%2Feu-central-1%2Fs3%2Faws4_request&X-Amz-Date=20250814T080522Z&X-Amz-Expires=604800&X-Amz-Signature=d94415b9080777592891379922a51df704952ad28e05873bcd2814e6801ee91f&X-Amz-SignedHeaders=host&x-amz-checksum-mode=ENABLED&x-id=GetObject",
    layoutName: "Cover Slide",
    slideObjectId: "p2",
    originalContent: "",
  },
  {
    s3Key:
      "d6b8d1d4-095c-4cfc-902f-546b3af99716/projects/e0b3a85d-2ae0-4da7-a3c7-cb2a483ed6df/presentations/1r28-9UhR-HNWhQTlw9hQvL47lrrkcPBsKOJFH9k3GL8/slides/thumbnail_p3.png",
    content: "",
    publicUrl:
      "https://sequesto-portal-dev-storage.s3.eu-central-1.amazonaws.com/d6b8d1d4-095c-4cfc-902f-546b3af99716/projects/e0b3a85d-2ae0-4da7-a3c7-cb2a483ed6df/presentations/1r28-9UhR-HNWhQTlw9hQvL47lrrkcPBsKOJFH9k3GL8/slides/thumbnail_p3.png?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Content-Sha256=UNSIGNED-PAYLOAD&X-Amz-Credential=AKIAUEVNDKJY5PF3524Y%2F20250814%2Feu-central-1%2Fs3%2Faws4_request&X-Amz-Date=20250814T080522Z&X-Amz-Expires=604800&X-Amz-Signature=6d4a43f79df0fbf9d08991a8833470416e60c78477507354c105284659a6be23&X-Amz-SignedHeaders=host&x-amz-checksum-mode=ENABLED&x-id=GetObject",
    layoutName: "Cover Slide",
    slideObjectId: "p3",
    originalContent: "",
  },
  {
    s3Key:
      "d6b8d1d4-095c-4cfc-902f-546b3af99716/projects/e0b3a85d-2ae0-4da7-a3c7-cb2a483ed6df/presentations/1r28-9UhR-HNWhQTlw9hQvL47lrrkcPBsKOJFH9k3GL8/slides/thumbnail_p4.png",
    content: "",
    publicUrl:
      "https://sequesto-portal-dev-storage.s3.eu-central-1.amazonaws.com/d6b8d1d4-095c-4cfc-902f-546b3af99716/projects/e0b3a85d-2ae0-4da7-a3c7-cb2a483ed6df/presentations/1r28-9UhR-HNWhQTlw9hQvL47lrrkcPBsKOJFH9k3GL8/slides/thumbnail_p4.png?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Content-Sha256=UNSIGNED-PAYLOAD&X-Amz-Credential=AKIAUEVNDKJY5PF3524Y%2F20250814%2Feu-central-1%2Fs3%2Faws4_request&X-Amz-Date=20250814T080522Z&X-Amz-Expires=604800&X-Amz-Signature=a194c78dba228ac788059272511f342eeb7a766734e1885b266b2962e6978b51&X-Amz-SignedHeaders=host&x-amz-checksum-mode=ENABLED&x-id=GetObject",
    layoutName: "Cover Slide",
    slideObjectId: "p4",
    originalContent: "",
  },
  {
    s3Key:
      "d6b8d1d4-095c-4cfc-902f-546b3af99716/projects/e0b3a85d-2ae0-4da7-a3c7-cb2a483ed6df/presentations/1r28-9UhR-HNWhQTlw9hQvL47lrrkcPBsKOJFH9k3GL8/slides/thumbnail_p5.png",
    content: "",
    publicUrl:
      "https://sequesto-portal-dev-storage.s3.eu-central-1.amazonaws.com/d6b8d1d4-095c-4cfc-902f-546b3af99716/projects/e0b3a85d-2ae0-4da7-a3c7-cb2a483ed6df/presentations/1r28-9UhR-HNWhQTlw9hQvL47lrrkcPBsKOJFH9k3GL8/slides/thumbnail_p5.png?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Content-Sha256=UNSIGNED-PAYLOAD&X-Amz-Credential=AKIAUEVNDKJY5PF3524Y%2F20250814%2Feu-central-1%2Fs3%2Faws4_request&X-Amz-Date=20250814T080522Z&X-Amz-Expires=604800&X-Amz-Signature=894ad34bb1e4fa420d40a085adc8035e7041ad01cf3df9870b7b45d4e581f173&X-Amz-SignedHeaders=host&x-amz-checksum-mode=ENABLED&x-id=GetObject",
    layoutName: "Cover Slide",
    slideObjectId: "p5",
    originalContent: "",
  },
  {
    s3Key:
      "d6b8d1d4-095c-4cfc-902f-546b3af99716/projects/e0b3a85d-2ae0-4da7-a3c7-cb2a483ed6df/presentations/1r28-9UhR-HNWhQTlw9hQvL47lrrkcPBsKOJFH9k3GL8/slides/thumbnail_p6.png",
    content: "",
    publicUrl:
      "https://sequesto-portal-dev-storage.s3.eu-central-1.amazonaws.com/d6b8d1d4-095c-4cfc-902f-546b3af99716/projects/e0b3a85d-2ae0-4da7-a3c7-cb2a483ed6df/presentations/1r28-9UhR-HNWhQTlw9hQvL47lrrkcPBsKOJFH9k3GL8/slides/thumbnail_p6.png?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Content-Sha256=UNSIGNED-PAYLOAD&X-Amz-Credential=AKIAUEVNDKJY5PF3524Y%2F20250814%2Feu-central-1%2Fs3%2Faws4_request&X-Amz-Date=20250814T080522Z&X-Amz-Expires=604800&X-Amz-Signature=f4dcc925c7bf43c91dc6bf0df2d43b175cb05c974160c3b4325fd632cb41c495&X-Amz-SignedHeaders=host&x-amz-checksum-mode=ENABLED&x-id=GetObject",
    layoutName: "Content slide_2",
    slideObjectId: "p6",
    originalContent:
      "BICS Confidential\n\n21/10/2024\n\nItem 1\tX\nSub item text runs here\tX\nSub item text runs here\tX\nSub item text runs here\tX\nItem 2\tX\nItem 3\tX\nItem 4\tX\n\nContents",
  },
  {
    s3Key:
      "d6b8d1d4-095c-4cfc-902f-546b3af99716/projects/e0b3a85d-2ae0-4da7-a3c7-cb2a483ed6df/presentations/1r28-9UhR-HNWhQTlw9hQvL47lrrkcPBsKOJFH9k3GL8/slides/thumbnail_p7.png",
    content: "",
    publicUrl:
      "https://sequesto-portal-dev-storage.s3.eu-central-1.amazonaws.com/d6b8d1d4-095c-4cfc-902f-546b3af99716/projects/e0b3a85d-2ae0-4da7-a3c7-cb2a483ed6df/presentations/1r28-9UhR-HNWhQTlw9hQvL47lrrkcPBsKOJFH9k3GL8/slides/thumbnail_p7.png?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Content-Sha256=UNSIGNED-PAYLOAD&X-Amz-Credential=AKIAUEVNDKJY5PF3524Y%2F20250814%2Feu-central-1%2Fs3%2Faws4_request&X-Amz-Date=20250814T080522Z&X-Amz-Expires=604800&X-Amz-Signature=b10245e74766226b7bda70592cfaff931232701c3bb1a8b611f92b396a87bfd7&X-Amz-SignedHeaders=host&x-amz-checksum-mode=ENABLED&x-id=GetObject",
    layoutName: "Chapter slide_2",
    slideObjectId: "p7",
    originalContent: "BICS Confidential\n\n21/10/2024",
  },
  {
    s3Key:
      "d6b8d1d4-095c-4cfc-902f-546b3af99716/projects/e0b3a85d-2ae0-4da7-a3c7-cb2a483ed6df/presentations/1r28-9UhR-HNWhQTlw9hQvL47lrrkcPBsKOJFH9k3GL8/slides/thumbnail_p8.png",
    content: "",
    publicUrl:
      "https://sequesto-portal-dev-storage.s3.eu-central-1.amazonaws.com/d6b8d1d4-095c-4cfc-902f-546b3af99716/projects/e0b3a85d-2ae0-4da7-a3c7-cb2a483ed6df/presentations/1r28-9UhR-HNWhQTlw9hQvL47lrrkcPBsKOJFH9k3GL8/slides/thumbnail_p8.png?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Content-Sha256=UNSIGNED-PAYLOAD&X-Amz-Credential=AKIAUEVNDKJY5PF3524Y%2F20250814%2Feu-central-1%2Fs3%2Faws4_request&X-Amz-Date=20250814T080522Z&X-Amz-Expires=604800&X-Amz-Signature=0c10bf6d2ae285be863bb1cf49ed7c6ae325dfc1d8d915987330e2b31c00b80d&X-Amz-SignedHeaders=host&x-amz-checksum-mode=ENABLED&x-id=GetObject",
    layoutName: "Title - subtitle - text + picture",
    slideObjectId: "p8",
    originalContent: "BICS Confidential\n\n21/10/2024",
  },
  {
    s3Key:
      "d6b8d1d4-095c-4cfc-902f-546b3af99716/projects/e0b3a85d-2ae0-4da7-a3c7-cb2a483ed6df/presentations/1r28-9UhR-HNWhQTlw9hQvL47lrrkcPBsKOJFH9k3GL8/slides/thumbnail_p9.png",
    content: "",
    publicUrl:
      "https://sequesto-portal-dev-storage.s3.eu-central-1.amazonaws.com/d6b8d1d4-095c-4cfc-902f-546b3af99716/projects/e0b3a85d-2ae0-4da7-a3c7-cb2a483ed6df/presentations/1r28-9UhR-HNWhQTlw9hQvL47lrrkcPBsKOJFH9k3GL8/slides/thumbnail_p9.png?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Content-Sha256=UNSIGNED-PAYLOAD&X-Amz-Credential=AKIAUEVNDKJY5PF3524Y%2F20250814%2Feu-central-1%2Fs3%2Faws4_request&X-Amz-Date=20250814T080522Z&X-Amz-Expires=604800&X-Amz-Signature=7a07c8cad869ba0b9f71a7af45ad423c3f1b9ff2f1f99e8a94173ed18e773d59&X-Amz-SignedHeaders=host&x-amz-checksum-mode=ENABLED&x-id=GetObject",
    layoutName: "1_Title - subtitle - 1 column text",
    slideObjectId: "p9",
    originalContent: "BICS Confidential\n\n21/10/2024",
  },
  {
    s3Key:
      "d6b8d1d4-095c-4cfc-902f-546b3af99716/projects/e0b3a85d-2ae0-4da7-a3c7-cb2a483ed6df/presentations/1r28-9UhR-HNWhQTlw9hQvL47lrrkcPBsKOJFH9k3GL8/slides/thumbnail_p10.png",
    content: "",
    publicUrl:
      "https://sequesto-portal-dev-storage.s3.eu-central-1.amazonaws.com/d6b8d1d4-095c-4cfc-902f-546b3af99716/projects/e0b3a85d-2ae0-4da7-a3c7-cb2a483ed6df/presentations/1r28-9UhR-HNWhQTlw9hQvL47lrrkcPBsKOJFH9k3GL8/slides/thumbnail_p10.png?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Content-Sha256=UNSIGNED-PAYLOAD&X-Amz-Credential=AKIAUEVNDKJY5PF3524Y%2F20250814%2Feu-central-1%2Fs3%2Faws4_request&X-Amz-Date=20250814T080522Z&X-Amz-Expires=604800&X-Amz-Signature=99d8fbc2fe5a82349f80c8dd38dbbfb0f8763aeb7990235b24cc7f86d4bf8853&X-Amz-SignedHeaders=host&x-amz-checksum-mode=ENABLED&x-id=GetObject",
    layoutName: "Title - subtitle - picture + text 2 column",
    slideObjectId: "p10",
    originalContent: "BICS Confidential\n\n21/10/2024",
  },
  {
    s3Key:
      "d6b8d1d4-095c-4cfc-902f-546b3af99716/projects/e0b3a85d-2ae0-4da7-a3c7-cb2a483ed6df/presentations/1r28-9UhR-HNWhQTlw9hQvL47lrrkcPBsKOJFH9k3GL8/slides/thumbnail_p11.png",
    content: "",
    publicUrl:
      "https://sequesto-portal-dev-storage.s3.eu-central-1.amazonaws.com/d6b8d1d4-095c-4cfc-902f-546b3af99716/projects/e0b3a85d-2ae0-4da7-a3c7-cb2a483ed6df/presentations/1r28-9UhR-HNWhQTlw9hQvL47lrrkcPBsKOJFH9k3GL8/slides/thumbnail_p11.png?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Content-Sha256=UNSIGNED-PAYLOAD&X-Amz-Credential=AKIAUEVNDKJY5PF3524Y%2F20250814%2Feu-central-1%2Fs3%2Faws4_request&X-Amz-Date=20250814T080522Z&X-Amz-Expires=604800&X-Amz-Signature=f852f4fc6e55b12f4c0620a297ce0513aa235a5947edaea1635882fb79b0dd17&X-Amz-SignedHeaders=host&x-amz-checksum-mode=ENABLED&x-id=GetObject",
    layoutName: "1_Title - subtitle - text + picture",
    slideObjectId: "p11",
    originalContent: "BICS Confidential\n\n21/10/2024",
  },
  {
    s3Key:
      "d6b8d1d4-095c-4cfc-902f-546b3af99716/projects/e0b3a85d-2ae0-4da7-a3c7-cb2a483ed6df/presentations/1r28-9UhR-HNWhQTlw9hQvL47lrrkcPBsKOJFH9k3GL8/slides/thumbnail_p12.png",
    content: "",
    publicUrl:
      "https://sequesto-portal-dev-storage.s3.eu-central-1.amazonaws.com/d6b8d1d4-095c-4cfc-902f-546b3af99716/projects/e0b3a85d-2ae0-4da7-a3c7-cb2a483ed6df/presentations/1r28-9UhR-HNWhQTlw9hQvL47lrrkcPBsKOJFH9k3GL8/slides/thumbnail_p12.png?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Content-Sha256=UNSIGNED-PAYLOAD&X-Amz-Credential=AKIAUEVNDKJY5PF3524Y%2F20250814%2Feu-central-1%2Fs3%2Faws4_request&X-Amz-Date=20250814T080522Z&X-Amz-Expires=604800&X-Amz-Signature=680ff5980c4b1a76f0eea35263f1dee2ef6dac687890a63ef7a2a33e946c6a36&X-Amz-SignedHeaders=host&x-amz-checksum-mode=ENABLED&x-id=GetObject",
    layoutName: "2_Chapter_1",
    slideObjectId: "p12",
    originalContent: "",
  },
];
const humanMsg = new HumanMessage({
  content: [
    {
      type: "text",
      text: "Please suggest updates to improve my slides.",
    },
    ...slideTemplatesData.map((slide) => ({
      type: "image_url",
      image_url: {
        url: slide.publicUrl,
        detail: "high",
      },
    })),
  ],
});
await fs.writeFile(
  historyPath,
  JSON.stringify([humanMsg.toJSON()], undefined, 2),
);
