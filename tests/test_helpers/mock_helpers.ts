const originalGetBoundingClientRect = HTMLDivElement.prototype.getBoundingClientRect;

export function mockGetBoundingClientRect(
  classesWithMocks: Record<string, (el: HTMLElement) => Partial<DOMRect>>
) {
  const mockedClasses = Object.keys(classesWithMocks);

  jest
    .spyOn(HTMLDivElement.prototype, "getBoundingClientRect")
    .mockImplementation(function (this: HTMLDivElement) {
      const mockedClass = mockedClasses.find((className) => this.classList.contains(className));
      if (mockedClass) {
        return populateDOMRect(classesWithMocks[mockedClass](this));
      }
      return originalGetBoundingClientRect.call(this);
    });
}

/**
 * Try to populate the DOMRect with all the values we can based on what's in the partial DOMRect provided.
 * For example set the rect.left if the rect.x is provided, or the rect.right if the rect.width
 * and rec.x are provided.
 */
function populateDOMRect(partialRect: Partial<DOMRect>): Partial<DOMRect> {
  const rect = { ...partialRect };

  if (rect.x && !rect.left) rect.left = rect.x;
  if (rect.y && !rect.top) rect.top = rect.y;
  if (rect.width && rect.x && !rect.right) rect.right = rect.x + rect.width;
  if (rect.height && rect.y && !rect.bottom) rect.bottom = rect.y + rect.height;
  if (rect.left && rect.right && !rect.width) rect.width = rect.right - rect.left;
  if (rect.top && rect.bottom && !rect.height) rect.height = rect.bottom - rect.top;

  return rect;
}
