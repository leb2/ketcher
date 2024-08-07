/****************************************************************************
 * Copyright 2021 EPAM Systems
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *    http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 ***************************************************************************/

import { updateCursorPosition } from './common';
import { throttle } from 'lodash';

type mouseListener = ((event: MouseEvent) => void) | null;

const MOUSE_MOVE_THROTTLE_TIMEOUT = 300;

const handleMouseMove = (dispatch, event: MouseEvent) => {
  dispatch(updateCursorPosition(event.clientX, event.clientY));
};

let pointerMoveListener: mouseListener = null;
let mouseDownListener: mouseListener = null;

export function initMouseListener(element) {
  return function (dispatch, getState) {
    const throttledHandleMouseMove = throttle(
      handleMouseMove,
      MOUSE_MOVE_THROTTLE_TIMEOUT,
    );

    pointerMoveListener = (event: MouseEvent) =>
      throttledHandleMouseMove(dispatch, event);
    mouseDownListener = (event: MouseEvent) => {
      const areBothLeftAndRightButtonsClicked = event.buttons === 3;
      if (areBothLeftAndRightButtonsClicked) {
        handleRightClick(getState);
      }
    };

    element.addEventListener('pointermove', pointerMoveListener);
    element.addEventListener('mousedown', mouseDownListener, true);
  };
}

export function removeMouseListeners(element) {
  return function () {
    if (pointerMoveListener) {
      element.removeEventListener('pointermove', pointerMoveListener);
    }

    if (mouseDownListener) {
      element.addEventListener('mousedown', mouseDownListener, true);
    }
  };
}

function handleRightClick(getState) {
  const state = getState();
  const { editor } = state;

  if (editor.rotateController.isRotating) {
    editor.rotateController.revert();
  }
}
