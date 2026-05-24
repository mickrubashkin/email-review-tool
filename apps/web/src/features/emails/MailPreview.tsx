import {
  ActionIcon,
  Button,
  Group,
  Popover,
  Stack,
  Text,
  Textarea,
  TextInput,
  Tooltip,
} from "@mantine/core";
import { useMediaQuery } from "@mantine/hooks";
import {
  ChatTextIcon,
  CodeIcon,
  PencilSimpleIcon,
} from "@phosphor-icons/react";

import {
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  type SyntheticEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

import { ReviewCommentOverlay } from "./ReviewCommentOverlay";
import type { EditableField, EditableFields, EmailDetail } from "./types";
import type { ReviewCommentTarget } from "./reviewOverlayTypes";
import { useReviewOverlayRects } from "./useReviewOverlayRects";
import styles from "./EmailPreviewDrawer.module.css";

export type PreviewViewport = "desktop" | "mobile";

export type ReviewTextSelection = {
  reviewBlock: string;
  selectedText: string;
  startOffset: number;
  endOffset: number;
};

type SelectionMenuState = ReviewTextSelection & {
  editableTarget: InlineEditableTarget | null;
  mode: "actions" | "comment" | "edit";
  x: number;
  y: number;
};

export type InlineEditUpdate = {
  editableFields?: EditableFields;
  preheader?: string;
  subject?: string;
};

type InlineEditInput = {
  field?: EditableField;
  key: string;
  label: string;
  type: "text" | "url" | "image" | "number";
  value: string | number;
};

type InlineEditableTarget = {
  inputs: InlineEditInput[];
  label: string;
};

type MailPreviewProps = {
  activeCommentId?: string | null;
  canEditContent?: boolean;
  canEditHTML?: boolean;
  commentTargets?: ReviewCommentTarget[];
  createCommentError?: boolean;
  email: EmailDetail;
  enableReviewSelectionComposer?: boolean;
  hoveredCommentId?: string | null;
  inlineEditError?: boolean;
  isApplyingInlineEdit?: boolean;
  isCreatingComment?: boolean;
  isScanning: boolean;
  onApplyInlineEdit?: (update: InlineEditUpdate) => void;
  onCommentBadgeClick?: (commentIds: string[]) => void;
  onCommentBadgeHover?: (commentIds: string[] | null) => void;
  onCreateReviewComment?: (selection: ReviewTextSelection, body: string) => void;
  onEditSourceHTML?: () => void;
  viewport: PreviewViewport;
};

export function MailPreview({
  activeCommentId = null,
  canEditContent = false,
  canEditHTML = false,
  commentTargets = [],
  createCommentError = false,
  email,
  enableReviewSelectionComposer = false,
  hoveredCommentId = null,
  inlineEditError = false,
  isApplyingInlineEdit = false,
  isCreatingComment = false,
  isScanning,
  onApplyInlineEdit,
  onCommentBadgeClick,
  onCommentBadgeHover,
  onCreateReviewComment,
  onEditSourceHTML,
  viewport,
}: MailPreviewProps) {
  const frameRef = useRef<HTMLIFrameElement | null>(null);
  const frameOverlayLayerRef = useRef<HTMLDivElement | null>(null);
  const overlayRootRef = useRef<HTMLElement | null>(null);
  const wasApplyingInlineEditRef = useRef(false);
  const wasCreatingCommentRef = useRef(false);
  const shouldShowCommentOverlay = !useMediaQuery("(max-width: 64em)");
  const [selectionMenu, setSelectionMenu] = useState<SelectionMenuState | null>(
    null
  );
  const [draftComment, setDraftComment] = useState("");
  const [draftInlineEdit, setDraftInlineEdit] = useState<
    Record<string, string | number>
  >({});
  const [frameLoadVersion, setFrameLoadVersion] = useState(0);
  const handleFrameLoad = useCallback(
    (event: SyntheticEvent<HTMLIFrameElement>) => {
      frameRef.current = event.currentTarget;
      setSelectionMenu(null);
      setDraftComment("");
      setDraftInlineEdit({});
      setFrameLoadVersion((version) => version + 1);

      if (enableReviewSelectionComposer) {
        installReviewSelectionMenu(event.currentTarget, email, setSelectionMenu);
      }
    },
    [email, enableReviewSelectionComposer]
  );
  const closeSelectionComposer = () => {
    setSelectionMenu(null);
    setDraftComment("");
    setDraftInlineEdit({});
  };
  const openCommentComposer = () => {
    setSelectionMenu((current) =>
      current ? { ...current, mode: "comment" } : current
    );
    setDraftComment("");
  };
  const openInlineEditor = () => {
    setSelectionMenu((current) => {
      if (!current?.editableTarget) {
        return current;
      }

      setDraftInlineEdit(
        Object.fromEntries(
          current.editableTarget.inputs.map((input) => [input.key, input.value])
        )
      );
      return { ...current, mode: "edit" };
    });
  };
  const handleSubmitComment = () => {
    if (!selectionMenu) {
      return;
    }

    const trimmedDraft = draftComment.trim();
    if (!trimmedDraft) {
      return;
    }

    onCreateReviewComment?.(
      {
        reviewBlock: selectionMenu.reviewBlock,
        selectedText: selectionMenu.selectedText,
        startOffset: selectionMenu.startOffset,
        endOffset: selectionMenu.endOffset,
      },
      trimmedDraft
    );
  };
  const handleApplyInlineEdit = () => {
    const target = selectionMenu?.editableTarget;
    if (!target) {
      return;
    }

    const nextEditableFields: EditableFields = {};
    let nextSubject: string | undefined;
    let nextPreheader: string | undefined;

    for (const input of target.inputs) {
      const value = draftInlineEdit[input.key] ?? input.value;
      if (input.key === "subject") {
        nextSubject = String(value);
        continue;
      }
      if (input.key === "preheader") {
        nextPreheader = String(value);
        continue;
      }
      if (input.field) {
        nextEditableFields[input.key] = {
          ...input.field,
          value: input.type === "number" ? Number(value) || 0 : String(value),
        };
      }
    }

    onApplyInlineEdit?.({
      ...(Object.keys(nextEditableFields).length > 0
        ? { editableFields: nextEditableFields }
        : {}),
      ...(nextSubject !== undefined ? { subject: nextSubject } : {}),
      ...(nextPreheader !== undefined ? { preheader: nextPreheader } : {}),
    });
  };
  const trimmedDraft = draftComment.trim();
  const openHeaderReviewComposer = (
    event: ReactMouseEvent<HTMLElement> | ReactKeyboardEvent<HTMLElement>,
    reviewBlock: string,
    selectedText: string
  ) => {
    const trimmedText = selectedText.trim();
    if (!trimmedText) {
      return;
    }

    const rect = event.currentTarget.getBoundingClientRect();
    setSelectionMenu({
      reviewBlock,
      editableTarget: getHeaderEditableTarget(reviewBlock, selectedText),
      mode: "actions",
      selectedText: trimmedText,
      startOffset: 0,
      endOffset: trimmedText.length,
      x: rect.left + rect.width / 2,
      y: rect.top,
    });
  };
  const handleHeaderReviewKeyDown = (
    event: ReactKeyboardEvent<HTMLElement>,
    reviewBlock: string,
    selectedText: string
  ) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      openHeaderReviewComposer(event, reviewBlock, selectedText);
    }
  };
  const overlay = useReviewOverlayRects({
    activeCommentId,
    commentTargets: shouldShowCommentOverlay ? commentTargets : [],
    frameOverlayLayerRef,
    frameLoadVersion,
    frameRef,
    overlayRootRef,
    viewport,
  });

  useEffect(() => {
    if (wasCreatingCommentRef.current && !isCreatingComment && !createCommentError) {
      closeSelectionComposer();
    }

    wasCreatingCommentRef.current = isCreatingComment;
  }, [createCommentError, isCreatingComment]);

  useEffect(() => {
    if (
      wasApplyingInlineEditRef.current &&
      !isApplyingInlineEdit &&
      !inlineEditError
    ) {
      closeSelectionComposer();
    }

    wasApplyingInlineEditRef.current = isApplyingInlineEdit;
  }, [inlineEditError, isApplyingInlineEdit]);

  return (
    <div className={styles.emailPreviewWrap} data-viewport={viewport}>
      <Popover
        opened={selectionMenu !== null}
        position="top"
        shadow="md"
        styles={{
          dropdown: {
            maxWidth: 340,
            width: 340,
          },
        }}
        withArrow
      >
        <Popover.Target>
          <div
            className={styles.selectionMenuAnchor}
            style={{
              left: selectionMenu?.x ?? 0,
              top: selectionMenu?.y ?? 0,
            }}
          />
        </Popover.Target>
        <Popover.Dropdown className={styles.selectionMenuDropdown}>
          {selectionMenu?.mode === "comment" ? (
            <Stack gap="xs">
              <Text c="dimmed" size="xs">
                {selectionMenu.reviewBlock}
              </Text>
              <Text className={styles.selectionMenuQuote} size="sm" lineClamp={3}>
                {selectionMenu.selectedText}
              </Text>
              <Textarea
                autosize
                data-autofocus
                disabled={isCreatingComment}
                minRows={3}
                placeholder="Add a comment"
                value={draftComment}
                onChange={(event) => setDraftComment(event.currentTarget.value)}
              />
              {createCommentError ? (
                <Text c="red" size="xs">
                  Failed to create comment.
                </Text>
              ) : null}
              <Group justify="flex-end" gap="xs">
                <Button
                  disabled={isCreatingComment}
                  size="xs"
                  variant="subtle"
                  onClick={closeSelectionComposer}
                >
                  Cancel
                </Button>
                <Button
                  disabled={!trimmedDraft}
                  loading={isCreatingComment}
                  size="xs"
                  onClick={handleSubmitComment}
                >
                  Add comment
                </Button>
              </Group>
            </Stack>
          ) : selectionMenu?.mode === "edit" && selectionMenu.editableTarget ? (
            <Stack gap="xs">
              <Text fw={700} size="sm">
                {selectionMenu.editableTarget.label}
              </Text>
              {selectionMenu.editableTarget.inputs.map((input, index) =>
                input.type === "text" && shouldUseInlineTextarea(input) ? (
                  <Textarea
                    autosize
                    data-autofocus={index === 0 || undefined}
                    disabled={isApplyingInlineEdit}
                    key={input.key}
                    label={input.label}
                    minRows={3}
                    value={String(draftInlineEdit[input.key] ?? input.value)}
                    onChange={(event) =>
                      setDraftInlineEdit((current) => ({
                        ...current,
                        [input.key]: event.currentTarget.value,
                      }))
                    }
                  />
                ) : (
                  <TextInput
                    data-autofocus={index === 0 || undefined}
                    disabled={isApplyingInlineEdit}
                    key={input.key}
                    label={input.label}
                    type={input.type === "number" ? "number" : "text"}
                    value={String(draftInlineEdit[input.key] ?? input.value)}
                    onChange={(event) =>
                      setDraftInlineEdit((current) => ({
                        ...current,
                        [input.key]:
                          input.type === "number"
                            ? Number(event.currentTarget.value) || 0
                            : event.currentTarget.value,
                      }))
                    }
                  />
                )
              )}
              {inlineEditError ? (
                <Text c="red" size="xs">
                  Failed to save edit.
                </Text>
              ) : null}
              <Group justify="flex-end" gap="xs">
                <Button
                  disabled={isApplyingInlineEdit}
                  size="xs"
                  variant="subtle"
                  onClick={closeSelectionComposer}
                >
                  Cancel
                </Button>
                <Button
                  loading={isApplyingInlineEdit}
                  size="xs"
                  onClick={handleApplyInlineEdit}
                >
                  Apply
                </Button>
              </Group>
            </Stack>
          ) : (
            <Stack gap="xs">
              <Text c="dimmed" size="xs">
                {selectionMenu?.reviewBlock}
              </Text>
              <Text className={styles.selectionMenuQuote} size="sm" lineClamp={3}>
                {selectionMenu?.selectedText}
              </Text>
              <Group gap="xs" justify="center">
                <Tooltip label="Comment">
                  <ActionIcon
                    aria-label="Comment"
                    size="lg"
                    variant="light"
                    onClick={openCommentComposer}
                  >
                    <ChatTextIcon aria-hidden="true" size={18} />
                  </ActionIcon>
                </Tooltip>
                {canEditContent && selectionMenu?.editableTarget ? (
                  <Tooltip label="Edit">
                    <ActionIcon
                      aria-label="Edit"
                      size="lg"
                      variant="light"
                      onClick={openInlineEditor}
                    >
                      <PencilSimpleIcon aria-hidden="true" size={18} />
                    </ActionIcon>
                  </Tooltip>
                ) : null}
                {canEditHTML ? (
                  <Tooltip label="Edit source HTML">
                    <ActionIcon
                      aria-label="Edit source HTML"
                      size="lg"
                      variant="light"
                      onClick={() => {
                        closeSelectionComposer();
                        onEditSourceHTML?.();
                      }}
                    >
                      <CodeIcon aria-hidden="true" size={18} />
                    </ActionIcon>
                  </Tooltip>
                ) : null}
              </Group>
            </Stack>
          )}
        </Popover.Dropdown>
      </Popover>

      <div className={styles.mailClient}>
        <article className={styles.mailReadPane} ref={overlayRootRef}>
          <header className={styles.mailHeader}>
            <Group className={styles.mailMetaRow} justify="space-between" gap="sm">
              <Group gap="sm" wrap="nowrap">
                <div className={styles.mailAvatar}>B</div>
                <Stack gap={0}>
                  <Text size="sm" fw={600}>
                    Bitrix24 Partners
                  </Text>
                  <Text
                    className={styles.headerReviewBlock}
                    data-review-block="subject"
                    role="button"
                    size="sm"
                    tabIndex={0}
                    onClick={(event) =>
                      openHeaderReviewComposer(
                        event,
                        "subject",
                        email.subject ?? email.title
                      )
                    }
                    onKeyDown={(event) =>
                      handleHeaderReviewKeyDown(
                        event,
                        "subject",
                        email.subject ?? email.title
                      )
                    }
                  >
                    {email.subject ?? email.title}
                  </Text>
                  {email.preheader ? (
                    <Text
                      className={styles.headerReviewBlock}
                      c="dimmed"
                      data-review-block="preheader"
                      role="button"
                      size="xs"
                      tabIndex={0}
                      onClick={(event) =>
                        openHeaderReviewComposer(
                          event,
                          "preheader",
                          email.preheader ?? ""
                        )
                      }
                      onKeyDown={(event) =>
                        handleHeaderReviewKeyDown(
                          event,
                          "preheader",
                          email.preheader ?? ""
                        )
                      }
                    >
                      {email.preheader}
                    </Text>
                  ) : null}
                  <Text size="xs" c="dimmed">
                    Reply-To: partners@bitrix24.com
                  </Text>
                </Stack>
              </Group>
            </Group>
          </header>

          <div className={styles.emailPreviewFrameWrap}>
            <iframe
              className={styles.emailPreviewFrame}
              onLoad={handleFrameLoad}
              ref={frameRef}
              title={email.title}
              sandbox="allow-same-origin"
              srcDoc={email.review_html || email.original_html}
            />
            {shouldShowCommentOverlay ? (
              <ReviewCommentOverlay
                activeCommentId={activeCommentId}
                badges={overlay.frameBadges}
                hoveredCommentId={hoveredCommentId}
                layerRef={frameOverlayLayerRef}
                onBadgeClick={onCommentBadgeClick}
                onBadgeHover={onCommentBadgeHover}
                rects={overlay.frameRects}
              />
            ) : null}
          </div>
          {shouldShowCommentOverlay ? (
            <ReviewCommentOverlay
              activeCommentId={activeCommentId}
              badges={overlay.externalBadges}
              hoveredCommentId={hoveredCommentId}
              onBadgeClick={onCommentBadgeClick}
              onBadgeHover={onCommentBadgeHover}
              rects={overlay.externalRects}
            />
          ) : null}
        </article>
      </div>
      {isScanning ? (
        <div className={styles.emailScanOverlay} aria-hidden="true" />
      ) : null}
    </div>
  );
}

function installReviewSelectionMenu(
  frame: HTMLIFrameElement,
  email: EmailDetail,
  setSelectionMenu: (selection: SelectionMenuState | null) => void
) {
  const frameDocument = frame.contentDocument;
  const frameWindow = frame.contentWindow;
  if (!frameDocument || !frameWindow) {
    return;
  }

  const updateSelectionMenu = () => {
    const selection = frameWindow.getSelection();
    const reviewSelection = getReviewSelection(selection);
    if (!reviewSelection) {
      setSelectionMenu(null);
      return;
    }

    const range = selection?.getRangeAt(0);
    const rangeRect = range?.getBoundingClientRect();
    if (!range || !rangeRect || (rangeRect.width === 0 && rangeRect.height === 0)) {
      setSelectionMenu(null);
      return;
    }

    const frameRect = frame.getBoundingClientRect();
    setSelectionMenu({
      ...reviewSelection,
      editableTarget: getEditableTargetFromNode(
        range.startContainer,
        email.editable_fields
      ),
      mode: "actions",
      x: frameRect.left + rangeRect.left + rangeRect.width / 2,
      y: frameRect.top + rangeRect.top,
    });
  };
  const openBlockSelectionComposer = (event: MouseEvent) => {
    const selection = frameWindow.getSelection();
    if (selection && !selection.isCollapsed) {
      return;
    }

    const target = event.target;
    if (!isElementLike(target)) {
      return;
    }

    const block = getCommentableReviewBlockFromClick(target);
    if (!block) {
      return;
    }

    const reviewSelection = getWholeBlockSelection(block);
    if (!reviewSelection) {
      return;
    }

    const frameRect = frame.getBoundingClientRect();
    const blockRect = block.getBoundingClientRect();
    setSelectionMenu({
      ...reviewSelection,
      editableTarget:
        getEditableTargetFromElement(target, email.editable_fields) ??
        getEditableTargetFromElement(block, email.editable_fields),
      mode: "actions",
      x: frameRect.left + blockRect.left + blockRect.width / 2,
      y: frameRect.top + blockRect.top,
    });
  };

  frameDocument.addEventListener("mouseup", updateSelectionMenu);
  frameDocument.addEventListener("click", openBlockSelectionComposer);
  frameDocument.addEventListener("keyup", updateSelectionMenu);
  frameDocument.addEventListener("selectionchange", () => {
    const selection = frameWindow.getSelection();
    if (!selection || selection.isCollapsed) {
      setSelectionMenu(null);
    }
  });
  frameWindow.addEventListener("scroll", () => setSelectionMenu(null), true);
}

function getReviewSelection(
  selection: Selection | null
): ReviewTextSelection | null {
  if (!selection || selection.isCollapsed || selection.rangeCount === 0) {
    return null;
  }

  const selectedText = selection.toString();
  if (!selectedText.trim()) {
    return null;
  }

  const range = selection.getRangeAt(0);
  const startBlock = getClosestReviewBlock(range.startContainer);
  const endBlock = getClosestReviewBlock(range.endContainer);
  if (!startBlock || startBlock !== endBlock) {
    return null;
  }

  const reviewBlock = startBlock.getAttribute("data-review-block");
  if (!reviewBlock) {
    return null;
  }

  const startOffset = getTextOffset(startBlock, range.startContainer, range.startOffset);
  const endOffset = startOffset + selectedText.length;

  return {
    reviewBlock,
    selectedText,
    startOffset,
    endOffset,
  };
}

function getWholeBlockSelection(block: Element): ReviewTextSelection | null {
  const reviewBlock = block.getAttribute("data-review-block");
  const selectedText = getReviewBlockSelectedText(block);
  if (!reviewBlock || !selectedText.trim()) {
    return null;
  }

  return {
    reviewBlock,
    selectedText,
    startOffset: 0,
    endOffset: selectedText.length,
  };
}

function getCommentableReviewBlockFromClick(target: Element) {
  const block = target.closest("[data-review-block]");
  if (!block || isNonCommentableReviewContainer(block)) {
    return null;
  }

  return block;
}

function isNonCommentableReviewContainer(block: Element) {
  const tagName = block.tagName.toLowerCase();
  if (tagName === "html" || tagName === "body") {
    return true;
  }

  if (block.querySelector("[data-review-block]")) {
    return true;
  }

  const text = getReviewBlockSelectedText(block);

  return !text;
}

function getReviewBlockSelectedText(block: Element) {
  const text = block.textContent?.trim();
  if (text) {
    return text;
  }

  const image = block.matches("img")
    ? block
    : block.querySelector("img");
  if (!image) {
    return "";
  }

  const imageLabel =
    image.getAttribute("alt")?.trim() ||
    image.getAttribute("aria-label")?.trim() ||
    image.getAttribute("title")?.trim();
  if (imageLabel) {
    return imageLabel;
  }

  const imageSource = image.getAttribute("src")?.trim();
  if (imageSource) {
    return `Image: ${imageSource.split("/").pop() ?? imageSource}`;
  }

  return `Image: ${block.getAttribute("data-review-block") ?? "review block"}`;
}

function getClosestReviewBlock(node: Node) {
  const element =
    node.nodeType === 1 ? (node as Element) : node.parentElement;
  return element?.closest("[data-review-block]") ?? null;
}

function getTextOffset(root: Element, targetNode: Node, targetOffset: number) {
  const range = root.ownerDocument.createRange();
  range.selectNodeContents(root);
  range.setEnd(targetNode, targetOffset);

  return range.toString().length;
}

function isElementLike(value: EventTarget | null): value is Element {
  return value !== null && "closest" in value;
}

function getHeaderEditableTarget(
  reviewBlock: string,
  selectedText: string
): InlineEditableTarget | null {
  if (reviewBlock !== "subject" && reviewBlock !== "preheader") {
    return null;
  }

  return {
    label: formatInlineEditLabel(reviewBlock),
    inputs: [
      {
        key: reviewBlock,
        label: formatInlineEditLabel(reviewBlock),
        type: "text",
        value: selectedText,
      },
    ],
  };
}

function getEditableTargetFromNode(
  node: Node,
  editableFields: EditableFields
): InlineEditableTarget | null {
  const element = node.nodeType === 1 ? (node as Element) : node.parentElement;
  if (!element) {
    return null;
  }

  return getEditableTargetFromElement(element, editableFields);
}

function getEditableTargetFromElement(
  element: Element,
  editableFields: EditableFields
): InlineEditableTarget | null {
  const editableElement =
    element.closest(editableSelector) ??
    (element.matches("[data-review-block]")
      ? element.querySelector(editableSelector)
      : null);
  if (!editableElement) {
    return null;
  }

  const inputs: InlineEditInput[] = [];
  appendInlineEditInput(inputs, editableElement, editableFields, "data-edit-text");
  appendInlineEditInput(inputs, editableElement, editableFields, "data-edit-attr-href");
  appendInlineEditInput(inputs, editableElement, editableFields, "data-edit-attr-src");
  appendInlineEditInput(inputs, editableElement, editableFields, "data-edit-attr-alt");
  appendInlineEditInput(inputs, editableElement, editableFields, "data-edit-style-width-px");

  if (inputs.length === 0) {
    return null;
  }

  const reviewBlock =
    editableElement.closest("[data-review-block]")?.getAttribute("data-review-block") ??
    inputs[0].key;
  return {
    inputs,
    label: formatInlineEditLabel(reviewBlock),
  };
}

const editableSelector = [
  "[data-edit-text]",
  "[data-edit-attr-href]",
  "[data-edit-attr-src]",
  "[data-edit-attr-alt]",
  "[data-edit-style-width-px]",
].join(",");

function appendInlineEditInput(
  inputs: InlineEditInput[],
  element: Element,
  editableFields: EditableFields,
  attribute: string
) {
  const key = element.getAttribute(attribute);
  if (!key || inputs.some((input) => input.key === key)) {
    return;
  }

  const field = editableFields[key];
  if (!field) {
    return;
  }

  inputs.push({
    field,
    key,
    label: formatInlineEditLabel(getInlineEditFieldLabel(key)),
    type: inlineInputTypeForField(field),
    value: field.value,
  });
}

function inlineInputTypeForField(field: EditableField) {
  if (field.type === "url" || field.type === "image") {
    return field.type;
  }
  if (field.type === "number") {
    return "number";
  }
  return "text";
}

function shouldUseInlineTextarea(input: InlineEditInput) {
  const value = String(input.value ?? "");
  return value.includes("\n") || value.length > 100;
}

function getInlineEditFieldLabel(key: string) {
  for (const suffix of ["_width_px", "_text", "_url", "_src", "_alt"]) {
    if (key.endsWith(suffix)) {
      return suffix.slice(1);
    }
  }

  return key;
}

function formatInlineEditLabel(value: string) {
  return value
    .split(/[_-]/)
    .filter(Boolean)
    .map((word) => `${word.charAt(0).toUpperCase()}${word.slice(1)}`)
    .join(" ");
}
