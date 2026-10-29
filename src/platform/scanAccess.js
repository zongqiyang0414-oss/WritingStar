// Preserve native failure reasons while giving a usable recovery action.
export function scanAccessError(message, code, action = "", cause) {
  const failure = new Error(message);
  failure.code = code;
  failure.action = action;
  failure.detail = cause?.errMsg || cause?.detail?.errMsg || cause?.message || "";
  return failure;
}

export function nativeScanError(cause, operation = "camera") {
  if (cause?.action !== undefined) return cause;
  const detail = String(cause?.errMsg || cause?.detail?.errMsg || cause?.message || "");
  if (/not.*declared|scope.*declare|privacy.*(?:not configured|not exist|not found|empty)|未配置.*隐私|隐私.*(?:未配置|未声明|不存在)|接口.*声明/i.test(detail))
    return scanAccessError("微信提示此功能缺少隐私声明。请小程序管理员在电脑登录微信公众平台，配置并发布“用户隐私保护指引”后重试。", "wx-privacy-config", "privacy-config", cause);
  if (/privacy|隐私/i.test(detail))
    return scanAccessError("微信未完成此次隐私授权。请重新开启相机或选择照片，并在微信弹窗中阅读、同意隐私指引。", "wx-privacy", "privacy", cause);
  if (operation === "privacy")
    return scanAccessError("隐私指引暂时无法打开，请重试；若仍失败，请管理员检查微信公众平台的指引配置。", "wx-privacy-open", "privacy-config", cause);
  if (/system.*(deny|denied|permission)|系统.*(权限|拒绝)/i.test(detail))
    return scanAccessError("手机系统未允许微信使用相机。请到手机设置中的微信权限开启相机，再返回重试。", "wx-system-camera", "app-settings", cause);
  if (/auth|permission|deny|denied|权限|授权/i.test(detail))
    return operation === "album"
      ? scanAccessError("未获准选择照片，请重新选择并允许访问。相册选图不需要小程序的摄像头授权。", "wx-album-denied", "mini-settings", cause)
      : scanAccessError("未获准使用相机。请在本小程序的设置中允许摄像头；若没有该选项，请点击“开启相机”先触发授权。", "wx-camera-denied", "mini-settings", cause);
  return scanAccessError(operation === "album" ? "相册未能打开，请稍后重试。" : "相机未能启动，可重试或使用系统相机拍摄。", "wx-media-failed", "", cause);
}

export function browserScanError(cause) {
  if (cause?.code && cause?.action !== undefined) return cause;
  const name = cause?.name;
  if (name === "NotAllowedError" || name === "PermissionDeniedError" || name === "SecurityError")
    return scanAccessError("Chrome 未允许此网站使用相机。请在地址栏的网站权限中允许相机，并检查手机设置是否允许 Chrome 使用相机；修改后点击重试。", "web-camera-denied", "web-help", cause);
  if (name === "NotFoundError" || name === "DevicesNotFoundError")
    return scanAccessError("没有找到可用摄像头，可以使用系统相机拍摄或从相册扫描。", "web-camera-missing", "", cause);
  if (name === "NotReadableError" || name === "TrackStartError" || name === "AbortError")
    return scanAccessError("相机可能正被其他应用占用。请关闭占用相机的应用，再点击重试。", "web-camera-busy", "", cause);
  return scanAccessError("相机未能开启，可以重试、使用系统相机拍摄或从相册扫描。", "web-camera-failed", "", cause);
}
