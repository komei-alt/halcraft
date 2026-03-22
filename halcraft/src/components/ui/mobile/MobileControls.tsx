// モバイルコントロール統合コンポーネント
// タッチデバイスの場合のみ表示

import { Joystick } from './Joystick';
import { JumpButton } from './JumpButton';
import { ActionButtons } from './ActionButtons';
import { TouchLookArea } from './TouchLookArea';

interface MobileControlsProps {
  /** クラフト画面を開くコールバック */
  onOpenCrafting: () => void;
}

export function MobileControls({ onOpenCrafting }: MobileControlsProps) {
  return (
    <>
      <TouchLookArea />
      <Joystick />
      <JumpButton />
      <ActionButtons onOpenCrafting={onOpenCrafting} />
    </>
  );
}
