import UIKit
import AVKit

/// 播放内核管理：builtin=AVPlayer(系统) / vlc=MobileVLCKit(内置真内核)
final class KernelManager: NSObject {
    static let shared = KernelManager()
    private var currentVC: UIViewController?

    func play(url: String, kernel: String, from root: UIViewController?) {
        guard let root = root, let u = URL(string: url) else { return }
        dismiss()
        let vc: UIViewController
        switch kernel {
        case "vlc":
            if VLCPlayerViewController.isAvailable {
                vc = VLCPlayerViewController(url: u)
            } else {
                vc = Self.makeAVPlayer(url: u)
            }
        default:
            vc = Self.makeAVPlayer(url: u)
        }
        currentVC = vc
        vc.modalPresentationStyle = .fullScreen
        root.present(vc, animated: true)
    }

    func dismiss() {
        currentVC?.dismiss(animated: false)
        currentVC = nil
    }

    private static func makeAVPlayer(url: URL) -> UIViewController {
        let p = AVPlayerViewController()
        p.player = AVPlayer(url: url)
        return p
    }
}

#if canImport(MobileVLCKit)
import MobileVLCKit

final class VLCPlayerViewController: UIViewController {
    static let isAvailable = true
    private var player: VLCMediaPlayer?
    private let url: URL
    private let closeButton = UIButton(type: .system)
    private let progressLabel = UILabel()

    init(url: URL) {
        self.url = url
        super.init(nibName: nil, bundle: nil)
    }
    required init?(coder: NSCoder) { fatalError("unsupported") }

    override var prefersStatusBarHidden: Bool { true }

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = .black

        let mp = VLCMediaPlayer(options: ["--avcodec-hw=any", "--audio-desync=0"])
        mp.drawable = view
        mp.media = VLCMedia(url: url)
        player = mp

        closeButton.setTitle("✕", for: .normal)
        closeButton.setTitleColor(.white, for: .normal)
        closeButton.backgroundColor = UIColor(white: 0, alpha: 0.55)
        closeButton.layer.cornerRadius = 18
        closeButton.translatesAutoresizingMaskIntoConstraints = false
        closeButton.addTarget(self, action: #selector(closeTapped), for: .touchUpInside)
        view.addSubview(closeButton)
        NSLayoutConstraint.activate([
            closeButton.topAnchor.constraint(equalTo: view.safeAreaLayoutGuide.topAnchor, constant: 14),
            closeButton.trailingAnchor.constraint(equalTo: view.safeAreaLayoutGuide.trailingAnchor, constant: -14),
            closeButton.widthAnchor.constraint(equalToConstant: 36),
            closeButton.heightAnchor.constraint(equalToConstant: 36),
        ])

        progressLabel.textColor = UIColor(white: 1, alpha: 0.85)
        progressLabel.font = .monospacedDigitSystemFont(ofSize: 12, weight: .medium)
        progressLabel.backgroundColor = UIColor(white: 0, alpha: 0.45)
        progressLabel.textAlignment = .center
        progressLabel.layer.cornerRadius = 8
        progressLabel.clipsToBounds = true
        progressLabel.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(progressLabel)
        NSLayoutConstraint.activate([
            progressLabel.topAnchor.constraint(equalTo: view.safeAreaLayoutGuide.topAnchor, constant: 14),
            progressLabel.leadingAnchor.constraint(equalTo: view.safeAreaLayoutGuide.leadingAnchor, constant: 14),
            progressLabel.heightAnchor.constraint(equalToConstant: 26),
            progressLabel.widthAnchor.constraint(greaterThanOrEqualToConstant: 96),
        ])
        mp.play()
        timeObserver = NotificationCenter.default.addObserver(
            forName: NSNotification.Name("VLCMediaPlayerTimeChanged"),
            object: mp, queue: .main) { [weak self] _ in self?.refreshLabel() }
    }

    private var timeObserver: NSObjectProtocol?

    deinit {
        if let o = timeObserver { NotificationCenter.default.removeObserver(o) }
    }

    private func refreshLabel() {
        guard let mp = player else { return }
        let tMs = Int(mp.time.intValue)
        let dMs = Int(mp.media?.length.intValue ?? 0)
        func f(_ ms: Int) -> String {
            let s = max(0, ms / 1000)
            return String(format: "%d:%02d", s / 60, s % 60)
        }
        progressLabel.text = dMs > 0 ? "\(f(tMs)) / \(f(dMs))" : "\(f(tMs))"
    }

    @objc private func closeTapped() {
        player?.stop()
        dismiss(animated: true)
    }
}
#else
final class VLCPlayerViewController: UIViewController {
    static let isAvailable = false
    init(url: URL) { super.init(nibName: nil, bundle: nil) }
    required init?(coder: NSCoder) { fatalError("unsupported") }
}
#endif
