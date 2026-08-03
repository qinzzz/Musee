type ComposerHeightInput = {
  contentHeight: number;
  lineHeight: number;
  chromeHeight: number;
  isFocused: boolean;
  isMobile: boolean;
};

const MOBILE_MIN_LINES = 3;
const MAX_LINES = 5;

export const getSessionComposerHeight = ({
  contentHeight,
  lineHeight,
  chromeHeight,
  isFocused,
  isMobile,
}: ComposerHeightInput) => {
  const minimumLines = isFocused ? MOBILE_MIN_LINES : 1;
  const minimumHeight = Math.ceil((lineHeight * minimumLines) + chromeHeight);
  const maximumHeight = Math.ceil((lineHeight * MAX_LINES) + chromeHeight);

  if (!isFocused) {
    return {
      height: minimumHeight,
      isScrollable: false,
    };
  }

  return {
    height: Math.min(Math.max(contentHeight, minimumHeight), maximumHeight),
    isScrollable: contentHeight > maximumHeight,
  };
};

export const shouldSubmitSessionComposerOnEnter = ({
  key,
  shiftKey,
  isMobile,
}: {
  key: string;
  shiftKey: boolean;
  isMobile: boolean;
}) => key === 'Enter' && !shiftKey && !isMobile;
