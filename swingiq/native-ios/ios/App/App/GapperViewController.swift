import Capacitor
import UIKit

/// The app's main screen: Capacitor's web view showing getgapper.com, plus Gapper's own native plugins.
/// Main.storyboard points at this class.
class GapperViewController: CAPBridgeViewController {
    override open func capacitorDidLoad() {
        bridge?.registerPluginInstance(GapperCapturePlugin())
    }
}
